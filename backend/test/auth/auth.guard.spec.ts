import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '../../src/auth/auth.guard';

describe('AuthGuard', () => {
    let guard: AuthGuard;
    const jwtService = { verifyAsync: jest.fn() };

    const createContext = (headers: Record<string, string> = {}) => {
        const request: any = { headers };
        const context = {
            switchToHttp: () => ({ getRequest: () => request })
        } as unknown as ExecutionContext;
        return { context, request };
    };

    beforeEach(() => {
        jest.resetAllMocks();
        guard = new AuthGuard(jwtService as unknown as JwtService);
    });

    it('allows the request and attaches the payload for a valid Bearer token', async () => {
        const payload = { sub: 'user-id', email: 'john@example.com' };
        jwtService.verifyAsync.mockResolvedValue(payload);
        const { context, request } = createContext({
            authorization: 'Bearer valid-token'
        });

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
        expect(request.user).toEqual(payload);
    });

    it('throws when the Authorization header is missing', async () => {
        const { context } = createContext();

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException
        );
        expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('throws when the scheme is not Bearer', async () => {
        const { context } = createContext({ authorization: 'Basic abc123' });

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException
        );
        expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('throws when the Bearer token is missing', async () => {
        const { context } = createContext({ authorization: 'Bearer' });

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException
        );
        expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when token verification fails', async () => {
        jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
        const { context, request } = createContext({
            authorization: 'Bearer expired-token'
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
            UnauthorizedException
        );
        expect(request.user).toBeUndefined();
    });
});
