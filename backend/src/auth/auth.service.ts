import {
    BadRequestException,
    Injectable,
    UnauthorizedException
} from '@nestjs/common';
import { SignupDto } from './dtos/signup.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './schemas/user.entity';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dtos/login.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private jwtService: JwtService
    ) {}

    async signUp(signupData: SignupDto) {
        const { name, email, password } = signupData;

        const emailInUse = await this.userRepository.findOneBy({ email });

        if (emailInUse) {
            throw new BadRequestException('Email already in use');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = this.userRepository.create({
            name,
            email,
            password: hashedPassword
        });

        await this.userRepository.save(newUser);

        return { name: name, email: email };
    }

    async login(loginData: LoginDto) {
        const { email, password } = loginData;

        const user = await this.userRepository.findOneBy({ email });
        const passwordMatches =
            user && (await bcrypt.compare(password, user.password));

        if (!passwordMatches) {
            throw new UnauthorizedException('Wrong credentials');
        }

        const payload = { sub: user.id, email: user.email };
        return {
            accessToken: await this.jwtService.signAsync(payload)
        };
    }

    async deleteUserById(id: string) {
        const user = await this.userRepository.findOneBy({ id });

        if (!user) {
            throw new BadRequestException('User does not exist');
        }

        const result = await this.userRepository.delete(user);
        return result;
    }

    async checkToken() {
        return { result: 'Token correct' };
    }
}
