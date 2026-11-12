import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { User } from '../../src/auth/schemas/user.entity';
import { NotificationService } from '../../src/notification/notification.service';

jest.mock('bcrypt');

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenFromLink = (link: string) => link.split('token=')[1];
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

describe('AuthService', () => {
    let service: AuthService;

    const userRepository = {
        findOneBy: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn()
    };
    const jwtService = {
        signAsync: jest.fn()
    };
    const notifications = {
        sendVerificationEmail: jest.fn()
    };
    const config = {
        getOrThrow: jest.fn()
    };

    const bcryptHash = bcrypt.hash as jest.Mock;
    const bcryptCompare = bcrypt.compare as jest.Mock;

    beforeEach(async () => {
        jest.resetAllMocks();
        config.getOrThrow.mockReturnValue('https://app.example.com');

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: getRepositoryToken(User), useValue: userRepository },
                { provide: JwtService, useValue: jwtService },
                { provide: NotificationService, useValue: notifications },
                { provide: ConfigService, useValue: config }
            ]
        }).compile();

        service = module.get<AuthService>(AuthService);
    });

    describe('signUp', () => {
        const signupData = {
            name: 'John',
            email: 'john@example.com',
            password: 'Passw0rd!'
        };

        it('creates an unverified user with a hashed password and returns name and email', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            const created = {};
            userRepository.create.mockReturnValue(created);
            userRepository.save.mockResolvedValue(created);

            const result = await service.signUp(signupData);

            expect(userRepository.findOneBy).toHaveBeenCalledWith({
                email: signupData.email
            });
            expect(bcryptHash).toHaveBeenCalledWith(signupData.password, 10);
            expect(userRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: signupData.name,
                    email: signupData.email,
                    password: 'hashed-password',
                    emailVerified: false
                })
            );
            expect(userRepository.save).toHaveBeenCalledWith(created);
            expect(result).toEqual({
                name: signupData.name,
                email: signupData.email
            });
        });

        it('emails a link whose token matches the stored hash (the raw token is not stored)', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});

            await service.signUp(signupData);

            expect(notifications.sendVerificationEmail).toHaveBeenCalledTimes(1);
            const [to, name, link] = notifications.sendVerificationEmail.mock.calls[0];
            expect(to).toBe(signupData.email);
            expect(name).toBe(signupData.name);
            expect(link).toContain('/verify-email?token=');

            const token = tokenFromLink(link);
            expect(token).toMatch(/^[a-f0-9]{64}$/);

            const createArg = userRepository.create.mock.calls[0][0];
            expect(createArg.verificationTokenHash).toBe(sha256(token));
            expect(JSON.stringify(createArg)).not.toContain(token);
            expect(createArg.verificationExpiresAt.getTime()).toBeGreaterThan(Date.now());
            expect(createArg.verificationSentAt).toBeInstanceOf(Date);
        });

        it('builds the link from FRONTEND_URL, ignoring a trailing slash', async () => {
            config.getOrThrow.mockReturnValue('https://app.example.com/');
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});

            await service.signUp(signupData);

            const link = notifications.sendVerificationEmail.mock.calls[0][2];
            expect(link.startsWith('https://app.example.com/verify-email?token=')).toBe(true);
        });

        it('never returns the password', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});

            const result = await service.signUp(signupData);

            expect(result).not.toHaveProperty('password');
        });

        it('throws BadRequestException when a verified account already uses the email', async () => {
            userRepository.findOneBy.mockResolvedValue({ id: '1', emailVerified: true });

            await expect(service.signUp(signupData)).rejects.toThrow(
                new BadRequestException('Email already in use')
            );
            expect(bcryptHash).not.toHaveBeenCalled();
            expect(userRepository.create).not.toHaveBeenCalled();
            expect(userRepository.save).not.toHaveBeenCalled();
            expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('lets the real owner take over an unverified account and sends a fresh link', async () => {
            const existing = {
                id: '1',
                name: 'Squatter',
                email: signupData.email,
                password: 'old-hash',
                emailVerified: false,
                verificationSentAt: minutesAgo(5)
            };
            userRepository.findOneBy.mockResolvedValue(existing);
            bcryptHash.mockResolvedValue('new-hash');
            userRepository.save.mockResolvedValue(existing);

            const result = await service.signUp(signupData);

            expect(userRepository.create).not.toHaveBeenCalled();
            expect(userRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: '1',
                    name: signupData.name,
                    password: 'new-hash',
                    emailVerified: false
                })
            );
            expect(notifications.sendVerificationEmail).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ name: signupData.name, email: signupData.email });
        });

        it('refuses to overwrite an unverified account within the resend cooldown', async () => {
            userRepository.findOneBy.mockResolvedValue({
                id: '1',
                emailVerified: false,
                verificationSentAt: new Date()
            });

            await expect(service.signUp(signupData)).rejects.toThrow(BadRequestException);
            expect(userRepository.save).not.toHaveBeenCalled();
            expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('propagates repository save errors', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});
            userRepository.save.mockRejectedValue(new Error('db down'));

            await expect(service.signUp(signupData)).rejects.toThrow('db down');
            expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
        });
    });

    describe('login', () => {
        const loginData = { email: 'john@example.com', password: 'Passw0rd!' };
        const user = {
            id: 'user-id',
            email: loginData.email,
            password: 'hashed-password',
            emailVerified: true
        };

        it('returns an access token for valid credentials', async () => {
            userRepository.findOneBy.mockResolvedValue(user);
            bcryptCompare.mockResolvedValue(true);
            jwtService.signAsync.mockResolvedValue('signed-token');

            const result = await service.login(loginData);

            expect(userRepository.findOneBy).toHaveBeenCalledWith({
                email: loginData.email
            });
            expect(bcryptCompare).toHaveBeenCalledWith(loginData.password, user.password);
            expect(jwtService.signAsync).toHaveBeenCalledWith({
                sub: user.id,
                email: user.email
            });
            expect(result).toEqual({ accessToken: 'signed-token' });
        });

        it('throws UnauthorizedException when the user does not exist', async () => {
            userRepository.findOneBy.mockResolvedValue(null);

            await expect(service.login(loginData)).rejects.toThrow(
                new UnauthorizedException('Wrong credentials')
            );
            expect(bcryptCompare).not.toHaveBeenCalled();
            expect(jwtService.signAsync).not.toHaveBeenCalled();
        });

        it('throws UnauthorizedException when the password is wrong', async () => {
            userRepository.findOneBy.mockResolvedValue(user);
            bcryptCompare.mockResolvedValue(false);

            await expect(service.login(loginData)).rejects.toThrow(
                new UnauthorizedException('Wrong credentials')
            );
            expect(jwtService.signAsync).not.toHaveBeenCalled();
        });

        it('uses the same error message for unknown user and wrong password', async () => {
            userRepository.findOneBy.mockResolvedValueOnce(null);
            const unknownUser = await service.login(loginData).catch((e) => e);

            userRepository.findOneBy.mockResolvedValueOnce(user);
            bcryptCompare.mockResolvedValueOnce(false);
            const wrongPassword = await service.login(loginData).catch((e) => e);

            expect(unknownUser.message).toBe(wrongPassword.message);
        });

        it('throws ForbiddenException when the password is right but the email is not verified', async () => {
            userRepository.findOneBy.mockResolvedValue({ ...user, emailVerified: false });
            bcryptCompare.mockResolvedValue(true);

            await expect(service.login(loginData)).rejects.toThrow(
                new ForbiddenException('Email not verified')
            );
            expect(jwtService.signAsync).not.toHaveBeenCalled();
        });

        it('does not reveal that an account is unverified when the password is wrong', async () => {
            userRepository.findOneBy.mockResolvedValue({ ...user, emailVerified: false });
            bcryptCompare.mockResolvedValue(false);

            await expect(service.login(loginData)).rejects.toThrow(
                new UnauthorizedException('Wrong credentials')
            );
        });
    });

    describe('verifyEmail', () => {
        const token = 'a'.repeat(64);

        it('marks the email as verified', async () => {
            const user = {
                id: 'user-id',
                emailVerified: false,
                verificationExpiresAt: minutesFromNow(60)
            };
            userRepository.findOneBy.mockResolvedValue(user);
            userRepository.save.mockResolvedValue(user);

            await expect(service.verifyEmail(token)).resolves.toEqual({ verified: true });

            expect(userRepository.findOneBy).toHaveBeenCalledWith({
                verificationTokenHash: sha256(token)
            });
            expect(userRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'user-id', emailVerified: true })
            );
        });

        it('succeeds again when the account is already verified, without saving', async () => {
            userRepository.findOneBy.mockResolvedValue({
                id: 'user-id',
                emailVerified: true,
                verificationExpiresAt: minutesAgo(60)
            });

            await expect(service.verifyEmail(token)).resolves.toEqual({ verified: true });
            expect(userRepository.save).not.toHaveBeenCalled();
        });

        it('rejects an unknown token', async () => {
            userRepository.findOneBy.mockResolvedValue(null);

            await expect(service.verifyEmail(token)).rejects.toThrow(
                new BadRequestException('Invalid or expired verification link')
            );
            expect(userRepository.save).not.toHaveBeenCalled();
        });

        it('rejects an expired token', async () => {
            userRepository.findOneBy.mockResolvedValue({
                id: 'user-id',
                emailVerified: false,
                verificationExpiresAt: minutesAgo(1)
            });

            await expect(service.verifyEmail(token)).rejects.toThrow(
                new BadRequestException('Invalid or expired verification link')
            );
            expect(userRepository.save).not.toHaveBeenCalled();
        });
    });

    describe('resendVerification', () => {
        const email = 'john@example.com';

        it('issues a new token for an unverified account and emails it', async () => {
            const user = {
                id: 'user-id',
                name: 'John',
                email,
                emailVerified: false,
                verificationTokenHash: sha256('old-token'),
                verificationSentAt: minutesAgo(5)
            };
            userRepository.findOneBy.mockResolvedValue(user);
            userRepository.save.mockResolvedValue(user);

            await service.resendVerification(email);

            expect(notifications.sendVerificationEmail).toHaveBeenCalledTimes(1);
            const [to, name, link] = notifications.sendVerificationEmail.mock.calls[0];
            expect(to).toBe(email);
            expect(name).toBe('John');

            const token = tokenFromLink(link);
            expect(userRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'user-id',
                    verificationTokenHash: sha256(token)
                })
            );
            expect(user.verificationTokenHash).not.toBe(sha256('old-token'));
        });

        it('sends nothing for an unknown email but answers the same way', async () => {
            userRepository.findOneBy.mockResolvedValueOnce(null);
            const unknown = await service.resendVerification(email);

            userRepository.findOneBy.mockResolvedValueOnce({
                id: 'user-id',
                emailVerified: false,
                verificationSentAt: minutesAgo(5)
            });
            const known = await service.resendVerification(email);

            expect(unknown).toEqual(known);
            expect(notifications.sendVerificationEmail).toHaveBeenCalledTimes(1);
        });

        it('sends nothing when the account is already verified', async () => {
            userRepository.findOneBy.mockResolvedValue({ id: 'user-id', emailVerified: true });

            await service.resendVerification(email);

            expect(userRepository.save).not.toHaveBeenCalled();
            expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
        });

        it('sends nothing within the cooldown after the previous email', async () => {
            userRepository.findOneBy.mockResolvedValue({
                id: 'user-id',
                emailVerified: false,
                verificationSentAt: new Date()
            });

            await service.resendVerification(email);

            expect(userRepository.save).not.toHaveBeenCalled();
            expect(notifications.sendVerificationEmail).not.toHaveBeenCalled();
        });
    });

    describe('deleteUserById', () => {
        it('deletes an existing user and returns the delete result', async () => {
            const deleteResult = { affected: 1, raw: [] };
            userRepository.findOneBy.mockResolvedValue({ id: 'user-id' });
            userRepository.delete.mockResolvedValue(deleteResult);

            await expect(service.deleteUserById('user-id')).resolves.toEqual(deleteResult);
            expect(userRepository.findOneBy).toHaveBeenCalledWith({ id: 'user-id' });
            expect(userRepository.delete).toHaveBeenCalledWith('user-id');
        });

        it('throws BadRequestException when the user does not exist', async () => {
            userRepository.findOneBy.mockResolvedValue(null);

            await expect(service.deleteUserById('missing')).rejects.toThrow(
                new BadRequestException('User does not exist')
            );
            expect(userRepository.delete).not.toHaveBeenCalled();
        });
    });

    describe('checkToken', () => {
        it('confirms the token is correct', async () => {
            await expect(service.checkToken()).resolves.toEqual({ result: 'Token correct' });
        });
    });
});
