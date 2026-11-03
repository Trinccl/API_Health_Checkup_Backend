import { Test, TestingModule } from '@nestjs/testing';
import { CheckerController } from '../../src/checker/checker.controller';
import { CheckerService } from '../../src/checker/checker.service';
import { NotificationService } from '../../src/notification/notification.service';
import { AuthGuard } from '../../src/auth/auth.guard';

describe('CheckerController - bodies', () => {
    let controller: CheckerController;

    const checkerService = {
        ping: jest.fn(),
        addApi: jest.fn(),
        updateApi: jest.fn()
    };

    beforeEach(async () => {
        jest.resetAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [CheckerController],
            providers: [
                { provide: CheckerService, useValue: checkerService },
                { provide: NotificationService, useValue: {} }
            ]
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get(CheckerController);
    });

    it('ping passes the whole dto (method and bodies included) to the service', async () => {
        const dto = {
            url: 'https://example.com',
            requestMethod: 'POST' as const,
            requestBody: '{"a":1}',
            expectedBody: 'ok'
        };
        checkerService.ping.mockResolvedValue({ time: 12 });

        await expect(controller.ping(dto)).resolves.toEqual({ time: 12 });
        expect(checkerService.ping).toHaveBeenCalledWith(dto);
    });

    it('addApi passes the bodies and the user id to the service', async () => {
        const dto: any = { name: 'n', requestBody: '{}', expectedBody: 'ok' };
        checkerService.addApi.mockResolvedValue({ id: '1' });

        await controller.addApi(dto, { sub: 'user-id' });

        expect(checkerService.addApi).toHaveBeenCalledWith(dto, 'user-id');
    });

    it('updateApi passes a null body through so it can be cleared', async () => {
        const id = '5b0c2f4e-6e0e-4f2f-9f55-0b2a9a1f1f11';
        checkerService.updateApi.mockResolvedValue({ id });

        await controller.updateApi(id, { requestBody: null }, { sub: 'user-id' });

        expect(checkerService.updateApi).toHaveBeenCalledWith(id, 'user-id', {
            requestBody: null
        });
    });
});
