import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';
import { User } from '../../src/auth/schemas/user.entity';

jest.mock('bcrypt');

describe('AuthService', () => {
    let service: AuthService;

    const userRepository = {
        findOneBy: jest.fn(),
        create: jest.fn(),
        save: jest.fn()
    };
    const jwtService = {
        signAsync: jest.fn()
    };

    const bcryptHash = bcrypt.hash as jest.Mock;
    const bcryptCompare = bcrypt.compare as jest.Mock;

    beforeEach(async () => {
        jest.resetAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: getRepositoryToken(User), useValue: userRepository },
                { provide: JwtService, useValue: jwtService }
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

        it('creates a user with a hashed password and returns name and email', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            const created = { ...signupData, password: 'hashed-password' };
            userRepository.create.mockReturnValue(created);
            userRepository.save.mockResolvedValue(created);

            const result = await service.signUp(signupData);

            expect(userRepository.findOneBy).toHaveBeenCalledWith({
                email: signupData.email
            });
            expect(bcryptHash).toHaveBeenCalledWith(signupData.password, 10);
            expect(userRepository.create).toHaveBeenCalledWith({
                name: signupData.name,
                email: signupData.email,
                password: 'hashed-password'
            });
            expect(userRepository.save).toHaveBeenCalledWith(created);
            expect(result).toEqual({
                name: signupData.name,
                email: signupData.email
            });
        });

        it('never returns the password', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});

            const result = await service.signUp(signupData);

            expect(result).not.toHaveProperty('password');
        });

        it('throws BadRequestException when the email is already in use', async () => {
            userRepository.findOneBy.mockResolvedValue({ id: '1' });

            await expect(service.signUp(signupData)).rejects.toThrow(
                new BadRequestException('Email already in use')
            );
            expect(bcryptHash).not.toHaveBeenCalled();
            expect(userRepository.create).not.toHaveBeenCalled();
            expect(userRepository.save).not.toHaveBeenCalled();
        });

        it('propagates repository save errors', async () => {
            userRepository.findOneBy.mockResolvedValue(null);
            bcryptHash.mockResolvedValue('hashed-password');
            userRepository.create.mockReturnValue({});
            userRepository.save.mockRejectedValue(new Error('db down'));

            await expect(service.signUp(signupData)).rejects.toThrow('db down');
        });
    });

    describe('login', () => {
        const loginData = { email: 'john@example.com', password: 'Passw0rd!' };
        const user = {
            id: 'user-id',
            email: loginData.email,
            password: 'hashed-password'
        };

        it('returns an access token for valid credentials', async () => {
            userRepository.findOneBy.mockResolvedValue(user);
            bcryptCompare.mockResolvedValue(true);
            jwtService.signAsync.mockResolvedValue('signed-token');

            const result = await service.login(loginData);

            expect(userRepository.findOneBy).toHaveBeenCalledWith({
                email: loginData.email
            });
            expect(bcryptCompare).toHaveBeenCalledWith(
                loginData.password,
                user.password
            );
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
            const wrongPassword = await service
                .login(loginData)
                .catch((e) => e);

            expect(unknownUser.message).toBe(wrongPassword.message);
        });
    });
});
