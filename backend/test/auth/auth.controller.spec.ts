import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { SignupDto } from '../../src/auth/dtos/signup.dto';
import { LoginDto } from '../../src/auth/dtos/login.dto';
import { AuthGuard } from '../../src/auth/auth.guard';

describe('AuthController', () => {
    let controller: AuthController;

    const authService = {
        signUp: jest.fn(),
        login: jest.fn(),
        deleteUserById: jest.fn(),
        checkToken: jest.fn()
    };

    beforeEach(async () => {
        jest.resetAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [{ provide: AuthService, useValue: authService }]
        })
            // the guard needs JwtService; it has its own spec, so stub it here
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

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

            await expect(controller.signUp({} as SignupDto)).rejects.toThrow('boom');
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

            await expect(controller.login({} as LoginDto)).rejects.toThrow('boom');
        });
    });

    describe('deleteMe', () => {
        it('deletes the user identified by the token subject', async () => {
            const expected = { affected: 1, raw: [] };
            authService.deleteUserById.mockResolvedValue(expected);

            await expect(controller.deleteMe({ sub: 'user-id' })).resolves.toEqual(expected);
            expect(authService.deleteUserById).toHaveBeenCalledWith('user-id');
        });

        it('propagates service errors', async () => {
            authService.deleteUserById.mockRejectedValue(new Error('boom'));

            await expect(controller.deleteMe({ sub: 'user-id' })).rejects.toThrow('boom');
        });
    });

    describe('checkToken', () => {
        it('delegates to AuthService.checkToken and returns its result', async () => {
            const expected = { result: 'Token correct' };
            authService.checkToken.mockResolvedValue(expected);

            await expect(controller.checkToken()).resolves.toEqual(expected);
            expect(authService.checkToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('guards', () => {
        it('protects deleteMe and checkToken with AuthGuard but leaves signup/login open', () => {
            const guards = (handler: object) => Reflect.getMetadata('__guards__', handler) ?? [];

            expect(guards(AuthController.prototype.deleteMe)).toContain(AuthGuard);
            expect(guards(AuthController.prototype.checkToken)).toContain(AuthGuard);
            expect(guards(AuthController.prototype.signUp)).toHaveLength(0);
            expect(guards(AuthController.prototype.login)).toHaveLength(0);
        });
    });
});
