import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignupDto } from './dtos/signup.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './schemas/user.entity';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../notification/notification.service';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_MESSAGE =
    'If that account exists and is not verified yet, a new verification email has been sent';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService,
        private readonly notifications: NotificationService,
        private readonly config: ConfigService
    ) {}

    async signUp(signupData: SignupDto) {
        const { name, email, password } = signupData;

        const existing = await this.userRepository.findOneBy({ email });

        if (existing?.emailVerified) {
            throw new BadRequestException('Email already in use');
        }

        if (existing && this.sentRecently(existing)) {
            throw new BadRequestException(
                'A verification email was just sent. Please wait a minute and try again.'
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { token, hash } = this.createVerificationToken();
        const verification = {
            emailVerified: false,
            verificationTokenHash: hash,
            verificationExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
            verificationSentAt: new Date()
        };

        const user = existing
            ? Object.assign(existing, { name, password: hashedPassword, ...verification })
            : this.userRepository.create({
                  name,
                  email,
                  password: hashedPassword,
                  ...verification
              });

        await this.userRepository.save(user);

        this.sendVerification(name, email, token);

        return { name: name, email: email };
    }

    async login(loginData: LoginDto) {
        const { email, password } = loginData;

        const user = await this.userRepository.findOneBy({ email });
        const passwordMatches = user && (await bcrypt.compare(password, user.password));

        if (!passwordMatches) {
            throw new UnauthorizedException('Wrong credentials');
        }

        if (!user.emailVerified) {
            throw new ForbiddenException('Email not verified');
        }

        const payload = { sub: user.id, email: user.email };
        return {
            accessToken: await this.jwtService.signAsync(payload)
        };
    }

    async verifyEmail(token: string) {
        const user = await this.userRepository.findOneBy({
            verificationTokenHash: this.hashToken(token)
        });

        if (!user) {
            throw new BadRequestException('Invalid or expired verification link');
        }

        if (user.emailVerified) {
            return { verified: true };
        }

        if (!user.verificationExpiresAt || user.verificationExpiresAt.getTime() < Date.now()) {
            throw new BadRequestException('Invalid or expired verification link');
        }

        user.emailVerified = true;
        await this.userRepository.save(user);

        return { verified: true };
    }

    async resendVerification(email: string) {
        const user = await this.userRepository.findOneBy({ email });

        if (user && !user.emailVerified && !this.sentRecently(user)) {
            const { token, hash } = this.createVerificationToken();

            user.verificationTokenHash = hash;
            user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);
            user.verificationSentAt = new Date();
            await this.userRepository.save(user);

            this.sendVerification(user.name, user.email, token);
        }

        return { message: RESEND_MESSAGE };
    }

    async deleteUserById(id: string) {
        const user = await this.userRepository.findOneBy({ id });

        if (!user) {
            throw new BadRequestException('User does not exist');
        }

        const result = await this.userRepository.delete(user.id);
        return result;
    }

    async checkToken() {
        return { result: 'Token correct' };
    }

    private createVerificationToken() {
        const token = randomBytes(32).toString('hex');
        return { token, hash: this.hashToken(token) };
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('hex');
    }

    private sentRecently(user: User) {
        return (
            !!user.verificationSentAt &&
            Date.now() - user.verificationSentAt.getTime() < RESEND_COOLDOWN_MS
        );
    }

    private sendVerification(name: string, email: string, token: string) {
        const base = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/+$/, '');

        void this.notifications.sendVerificationEmail(
            email,
            name,
            `${base}/verify-email?token=${token}`
        );
    }
}
