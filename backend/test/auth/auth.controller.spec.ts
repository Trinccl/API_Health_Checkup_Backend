import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { SignupDto } from '../../src/auth/dtos/signup.dto';
import { LoginDto } from '../../src/auth/dtos/login.dto';

describe('AuthController', () => {
    let controller: AuthController;

    const authService = {
        signUp: jest.fn(),
        login: jest.fn()
    };

    beforeEach(async () => {
        jest.resetAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: AuthService, useValue: authService }]
        }).compile();

        controller = module.get<AuthController>(AuthController);
    });

    describe('signUp', () => {
        it('delegates to AuthService.signUp and returns its result', async () => {
            const dto: SignupDto = {
                name: 'John',
                email: 'john@example.com',
                password: 'Passw0rd!'
            };
            const expected = { name: dto.name, email: dto.email };
            authService.signUp.mockResolvedValue(expected);

            await expect(controller.signUp(dto)).resolves.toEqual(expected);
            expect(authService.signUp).toHaveBeenCalledWith(dto);
        });

        it('propagates service errors', async () => {
            authService.signUp.mockRejectedValue(new Error('boom'));

            await expect(controller.signUp({} as SignupDto)).rejects.toThrow(
                'boom'
            );
        });
    });

    describe('login', () => {
        it('delegates to AuthService.login and returns its result', async () => {
            const dto: LoginDto = {
                email: 'john@example.com',
                password: 'Passw0rd!'
            };
            const expected = { accessToken: 'token' };
            authService.login.mockResolvedValue(expected);

            await expect(controller.login(dto)).resolves.toEqual(expected);
            expect(authService.login).toHaveBeenCalledWith(dto);
        });

        it('propagates service errors', async () => {
            authService.login.mockRejectedValue(new Error('boom'));

            await expect(controller.login({} as LoginDto)).rejects.toThrow(
                'boom'
            );
        });
    });
});
