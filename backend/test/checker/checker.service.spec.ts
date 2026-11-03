import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { BadRequestException } from '@nestjs/common';
import { CheckerService } from '../../src/checker/checker.service';
import { Api } from '../../src/checker/schemas/api.entity';
import { ApiLog } from '../../src/checker/schemas/api-log.entity';
import { NotificationService } from '../../src/notification/notification.service';

// Real cron jobs would keep timers alive and never let Jest exit
jest.mock('cron', () => ({
    CronJob: jest.fn().mockImplementation(() => ({ start: jest.fn() }))
}));

const fakeResponse = (opts: { ok?: boolean; status?: number; body?: string } = {}) => ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    text: jest.fn().mockResolvedValue(opts.body ?? ''),
    body: { cancel: jest.fn().mockResolvedValue(undefined) }
});

describe('CheckerService - request body & expected body', () => {
    let service: CheckerService;
    let fetchMock: jest.SpyInstance;

    const apiRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        exists: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        remove: jest.fn()
    };
    const apiLogRepository = { create: jest.fn(), save: jest.fn(), findAndCount: jest.fn() };
    const schedulerRegistry = {
        doesExist: jest.fn(),
        deleteCronJob: jest.fn(),
        addCronJob: jest.fn()
    };
    const notifications = {
        sendDownAlert: jest.fn(),
        sendSlowWarning: jest.fn(),
        sendRecovered: jest.fn(),
        sendSlowRecovered: jest.fn()
    };

    const makeApi = (overrides: Partial<Api> = {}): Api =>
        ({
            id: 'api-id',
            name: 'My API',
            url: 'https://example.com/health',
            slowThresholdMs: 100_000,
            errorsToAlert: 3,
            requestMethod: 'POST',
            intervalMinutes: 5,
            alertOnDown: true,
            alertOnSlow: true,
            status: 'UP',
            consecutiveFailures: 0,
            consecutiveSlowChecks: 0,
            requestBody: null,
            expectedBody: null,
            user: { id: 'user-id', email: 'john@example.com' },
            ...overrides
        }) as Api;

    /** Run a scheduled check and return what was logged. */
    const runAndGetLog = async (api: Api) => {
        apiRepository.findOne.mockResolvedValue(api);
        apiLogRepository.create.mockImplementation((x) => x);
        await service.runCheck(api.id);
        return apiLogRepository.create.mock.calls[0][0];
    };

    beforeEach(async () => {
        jest.resetAllMocks();
        fetchMock = jest.spyOn(global, 'fetch');
        schedulerRegistry.doesExist.mockReturnValue(false);
        // resetAllMocks wipes the factory implementation, so restore it
        (jest.requireMock('cron').CronJob as jest.Mock).mockImplementation(() => ({
            start: jest.fn()
        }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CheckerService,
                { provide: getRepositoryToken(Api), useValue: apiRepository },
                { provide: getRepositoryToken(ApiLog), useValue: apiLogRepository },
                { provide: SchedulerRegistry, useValue: schedulerRegistry },
                { provide: NotificationService, useValue: notifications }
            ]
        }).compile();

        service = module.get(CheckerService);
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        fetchMock.mockRestore();
        jest.restoreAllMocks();
    });

    describe('request body sent by checks', () => {
        it('sends a JSON body with an application/json content type', async () => {
            fetchMock.mockResolvedValue(fakeResponse());
            await runAndGetLog(makeApi({ requestBody: '{"ping":true}' }));

            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('https://example.com/health');
            expect(init.method).toBe('POST');
            expect(init.body).toBe('{"ping":true}');
            expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        });

        it('sends a non-JSON body as text/plain', async () => {
            fetchMock.mockResolvedValue(fakeResponse());
            await runAndGetLog(makeApi({ requestBody: 'just some text' }));

            const init = fetchMock.mock.calls[0][1];
            expect(init.body).toBe('just some text');
            expect(init.headers).toEqual({ 'Content-Type': 'text/plain' });
        });

        it('sends no body or content type when requestBody is not set', async () => {
            fetchMock.mockResolvedValue(fakeResponse());
            await runAndGetLog(makeApi({ requestBody: null }));

            const init = fetchMock.mock.calls[0][1];
            expect(init.body).toBeUndefined();
            expect(init.headers).toBeUndefined();
        });

        it('never sends a body with GET, even if one is stored', async () => {
            fetchMock.mockResolvedValue(fakeResponse());
            await runAndGetLog(makeApi({ requestMethod: 'GET', requestBody: 'stale' }));

            expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
        });

        it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
            'sends the body for %s',
            async (m) => {
                fetchMock.mockResolvedValue(fakeResponse());
                await runAndGetLog(makeApi({ requestMethod: m, requestBody: '{}' }));

                expect(fetchMock.mock.calls[0][1].method).toBe(m);
                expect(fetchMock.mock.calls[0][1].body).toBe('{}');
            }
        );
    });

    describe('expected body matching', () => {
        it('is UP when the response body contains the expected text', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ body: '{"status":"healthy","v":2}' }));
            const log = await runAndGetLog(makeApi({ expectedBody: '"status":"healthy"' }));

            expect(log.status).toBe('UP');
            expect(log.statusCode).toBe(200);
            expect(log.error).toBeNull();
        });

        it('is ERROR with a clear message when the text is missing', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ body: '{"status":"degraded"}' }));
            const log = await runAndGetLog(makeApi({ expectedBody: 'healthy' }));

            expect(log.status).toBe('ERROR');
            expect(log.statusCode).toBe(200);
            expect(log.error).toBe('Response body did not contain expected text');
            expect(apiRepository.update).toHaveBeenCalledWith(
                'api-id',
                expect.objectContaining({ status: 'ERROR' })
            );
        });

        it('matching is case sensitive', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ body: 'HEALTHY' }));
            const log = await runAndGetLog(makeApi({ expectedBody: 'healthy' }));

            expect(log.status).toBe('ERROR');
        });

        it('reports the HTTP status, not a body mismatch, when the response is not ok', async () => {
            const res = fakeResponse({ ok: false, status: 500, body: 'healthy' });
            fetchMock.mockResolvedValue(res);
            const log = await runAndGetLog(makeApi({ expectedBody: 'healthy' }));

            expect(log.status).toBe('ERROR');
            expect(log.error).toBe('HTTP 500');
            expect(res.text).not.toHaveBeenCalled();
        });

        it('does not read the body when no expectedBody is configured, and releases it', async () => {
            const res = fakeResponse({ body: 'anything' });
            fetchMock.mockResolvedValue(res);
            const log = await runAndGetLog(makeApi({ expectedBody: null }));

            expect(log.status).toBe('UP');
            expect(res.text).not.toHaveBeenCalled();
            expect(res.body.cancel).toHaveBeenCalled();
        });

        it('is DOWN with a timeout message when the request times out', async () => {
            const err = new Error('The operation was aborted');
            err.name = 'TimeoutError';
            fetchMock.mockRejectedValue(err);
            const log = await runAndGetLog(makeApi({ expectedBody: 'x' }));

            expect(log.status).toBe('DOWN');
            expect(log.statusCode).toBeNull();
            expect(log.error).toMatch(/^Timeout after \d+ms$/);
        });

        it('does not count a body mismatch as a consecutive "down" failure', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ body: 'nope' }));
            await runAndGetLog(makeApi({ expectedBody: 'healthy', consecutiveFailures: 2 }));

            expect(apiRepository.update).toHaveBeenCalledWith(
                'api-id',
                expect.objectContaining({ consecutiveFailures: 0 })
            );
            expect(notifications.sendDownAlert).not.toHaveBeenCalled();
        });
    });

    describe('ping', () => {
        it('defaults to GET without a body', async () => {
            fetchMock.mockResolvedValue(fakeResponse());

            const result = await service.ping({ url: 'https://example.com' });

            expect(result.time).toEqual(expect.any(Number));
            expect(fetchMock.mock.calls[0][1].method).toBe('GET');
            expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
        });

        it('forwards method and request body', async () => {
            fetchMock.mockResolvedValue(fakeResponse());

            await service.ping({
                url: 'https://example.com',
                requestMethod: 'PUT',
                requestBody: '{"a":1}'
            });

            expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
            expect(fetchMock.mock.calls[0][1].body).toBe('{"a":1}');
        });

        it('fails with the reason when expectedBody does not match', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ body: 'other' }));

            await expect(
                service.ping({ url: 'https://example.com', expectedBody: 'healthy' })
            ).rejects.toThrow(
                new BadRequestException(['Response body did not contain expected text'])
            );
        });

        it('fails with the HTTP status for a non-ok response', async () => {
            fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 503 }));

            await expect(service.ping({ url: 'https://example.com' })).rejects.toThrow(
                new BadRequestException(['HTTP 503'])
            );
        });

        it('rejects a body with GET before making any request', async () => {
            await expect(
                service.ping({ url: 'https://example.com', requestMethod: 'GET', requestBody: 'x' })
            ).rejects.toThrow(BadRequestException);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects expectedBody with HEAD before making any request', async () => {
            await expect(
                service.ping({
                    url: 'https://example.com',
                    requestMethod: 'HEAD',
                    expectedBody: 'x'
                })
            ).rejects.toThrow(BadRequestException);
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('addApi', () => {
        const apiData = {
            name: 'My API',
            url: 'https://example.com/health',
            slowThresholdMs: 1000,
            errorsToAlert: 3,
            requestMethod: 'POST' as const,
            intervalMinutes: 5
        };

        beforeEach(() => {
            apiRepository.exists.mockResolvedValue(false);
            apiRepository.create.mockImplementation((x) => x);
            apiRepository.save.mockImplementation(async (x) => ({ id: 'new-id', ...x }));
            fetchMock.mockResolvedValue(fakeResponse());
        });

        it('persists requestBody and expectedBody', async () => {
            const saved = await service.addApi(
                { ...apiData, requestBody: '{"a":1}', expectedBody: 'ok' },
                'user-id'
            );

            expect(apiRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({ requestBody: '{"a":1}', expectedBody: 'ok' })
            );
            expect(saved).toEqual(expect.objectContaining({ requestBody: '{"a":1}' }));
        });

        it('rejects requestBody with GET and saves nothing', async () => {
            await expect(
                service.addApi({ ...apiData, requestMethod: 'GET', requestBody: 'x' }, 'user-id')
            ).rejects.toThrow(BadRequestException);
            expect(apiRepository.save).not.toHaveBeenCalled();
        });

        it('rejects expectedBody with HEAD and saves nothing', async () => {
            await expect(
                service.addApi({ ...apiData, requestMethod: 'HEAD', expectedBody: 'x' }, 'user-id')
            ).rejects.toThrow(BadRequestException);
            expect(apiRepository.save).not.toHaveBeenCalled();
        });

        it('allows GET with an expectedBody', async () => {
            await expect(
                service.addApi({ ...apiData, requestMethod: 'GET', expectedBody: 'ok' }, 'user-id')
            ).resolves.toBeDefined();
        });
    });

    describe('updateApi', () => {
        let stored: Api;

        beforeEach(() => {
            stored = makeApi({
                requestMethod: 'POST',
                requestBody: '{"a":1}',
                expectedBody: 'ok',
                status: 'DOWN',
                consecutiveFailures: 4,
                consecutiveSlowChecks: 2
            });
            apiRepository.findOne.mockResolvedValue(stored);
            apiRepository.save.mockImplementation(async (x) => x);
        });

        it('rejects changing the method to GET while a requestBody is stored', async () => {
            await expect(
                service.updateApi('api-id', 'user-id', { requestMethod: 'GET' })
            ).rejects.toThrow(BadRequestException);
            expect(apiRepository.save).not.toHaveBeenCalled();
        });

        it('allows changing the method to GET when the body is cleared in the same patch', async () => {
            const saved = await service.updateApi('api-id', 'user-id', {
                requestMethod: 'GET',
                requestBody: null
            });

            expect(saved.requestMethod).toBe('GET');
            expect(saved.requestBody).toBeNull();
        });

        it('rejects adding a requestBody to an existing GET check', async () => {
            stored.requestMethod = 'GET';
            stored.requestBody = null;

            await expect(
                service.updateApi('api-id', 'user-id', { requestBody: 'x' })
            ).rejects.toThrow(BadRequestException);
        });

        it('rejects changing the method to HEAD while an expectedBody is stored', async () => {
            await expect(
                service.updateApi('api-id', 'user-id', { requestMethod: 'HEAD', requestBody: null })
            ).rejects.toThrow(BadRequestException);
        });

        it('clears a field when null is sent', async () => {
            const saved = await service.updateApi('api-id', 'user-id', { expectedBody: null });

            expect(saved.expectedBody).toBeNull();
            expect(saved.requestBody).toBe('{"a":1}');
        });

        it('leaves the bodies untouched when they are not in the patch', async () => {
            const saved = await service.updateApi('api-id', 'user-id', { name: 'Renamed' });

            expect(saved.requestBody).toBe('{"a":1}');
            expect(saved.expectedBody).toBe('ok');
        });

        it.each([
            ['requestBody', { requestBody: '{"a":2}' }],
            ['expectedBody', { expectedBody: 'different' }]
        ])('resets status and counters when %s changes', async (_label, patch) => {
            const saved = await service.updateApi('api-id', 'user-id', patch);

            expect(saved.status).toBe('UNKNOWN');
            expect(saved.consecutiveFailures).toBe(0);
            expect(saved.consecutiveSlowChecks).toBe(0);
        });

        it('keeps status and counters when the body is re-sent unchanged', async () => {
            const saved = await service.updateApi('api-id', 'user-id', {
                requestBody: '{"a":1}',
                expectedBody: 'ok'
            });

            expect(saved.status).toBe('DOWN');
            expect(saved.consecutiveFailures).toBe(4);
        });
    });
});
