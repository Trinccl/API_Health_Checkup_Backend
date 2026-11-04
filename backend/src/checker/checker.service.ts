import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit
} from '@nestjs/common';
import { ApiDto, HttpMethod } from './dtos/api.dto';
import { UpdateApiDto } from './dtos/update-api.dto';
import { LogsQueryDto } from './dtos/logs-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Api } from './schemas/api.entity';
import { ApiLog } from './schemas/api-log.entity';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { UrlDto } from './dtos/url.dto';
import {
    ApiStatus,
    MAX_EXPECTED_BODY_LENGTH,
    METHODS_WITHOUT_REQUEST_BODY,
    METHODS_WITHOUT_RESPONSE_BODY,
    REQUEST_TIMEOUT_MS
} from './checker.constants';
import { NotificationService } from '../notification/notification.service';

type CheckResult = {
    ok: boolean;
    statusCode: number | null;
    responseTimeMs: number | null;
    responseBody: string | null;
    error: string | null;
};

@Injectable()
export class CheckerService implements OnModuleInit {
    private readonly logger = new Logger(CheckerService.name);

    constructor(
        @InjectRepository(Api)
        private apiRepository: Repository<Api>,
        @InjectRepository(ApiLog)
        private apiLogRepository: Repository<ApiLog>,
        private readonly schedulerRegistry: SchedulerRegistry,
        private readonly notifications: NotificationService
    ) {}

    async onModuleInit() {
        const apis = await this.apiRepository.find({ where: { enabled: true } });
        apis.forEach((api) => this.scheduleApiCron(api));
    }

    async ping(dto: UrlDto): Promise<{ time: number }> {
        const method = dto.requestMethod ?? 'GET';
        const requestBody = dto.requestBody ?? null;
        const expectedBody = dto.expectedBody ?? null;

        this.assertBodyRules(method, requestBody, expectedBody);

        const result = await this.check(dto.url, method, requestBody, expectedBody);

        if (!result.ok) {
            throw new BadRequestException([result.error ?? 'url must be a reachable URL address']);
        }

        return { time: result.responseTimeMs as number };
    }

    // Rejects body options that make no sense for the chosen HTTP method.
    private assertBodyRules(
        method: string,
        requestBody: string | null | undefined,
        expectedBody: string | null | undefined
    ) {
        const errors: string[] = [];

        if (requestBody && METHODS_WITHOUT_REQUEST_BODY.includes(method)) {
            errors.push(`requestBody is not allowed for ${method} requests`);
        }
        if (expectedBody && METHODS_WITHOUT_RESPONSE_BODY.includes(method)) {
            errors.push(`expectedBody cannot be used with ${method} requests (no response body)`);
        }

        if (errors.length) {
            throw new BadRequestException(errors);
        }
    }

    private buildRequestInit(method: HttpMethod, requestBody?: string | null): RequestInit {
        const init: RequestInit = {
            method,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        };

        if (requestBody && !METHODS_WITHOUT_REQUEST_BODY.includes(method)) {
            init.body = requestBody;
            init.headers = {
                'Content-Type': this.isJson(requestBody) ? 'application/json' : 'text/plain'
            };
        }

        return init;
    }

    private isJson(value: string): boolean {
        try {
            JSON.parse(value);
            return true;
        } catch {
            return false;
        }
    }

    private async check(
        url: string,
        method: HttpMethod,
        requestBody?: string | null,
        expectedBody?: string | null
    ): Promise<CheckResult> {
        const start = performance.now();

        try {
            const response = await fetch(url, this.buildRequestInit(method, requestBody));
            const responseTimeMs = performance.now() - start;
            let ok = response.ok;
            let error = response.ok ? null : `HTTP ${response.status}`;
            let responseBody: string | null = null;
            if (ok && expectedBody) {
                const body = await response.text();
                responseBody = body;
                if (!body.includes(expectedBody)) {
                    ok = false;
                    error = 'Response body did not contain expected text';
                }
            } else {
                // Not reading the body: release the connection
                await response.body?.cancel().catch(() => undefined);
            }

            return {
                ok,
                statusCode: response.status,
                responseTimeMs: responseTimeMs,
                responseBody,
                error
            };
        } catch (e: any) {
            let error: string;
            if (e?.name === 'TimeoutError') {
                error = `Timeout after ${REQUEST_TIMEOUT_MS}ms`;
            } else if (e?.message) {
                error = e.message;
            } else {
                error = 'Unknown error';
            }

            return {
                ok: false,
                statusCode: null,
                responseTimeMs: null,
                responseBody: null,
                error
            };
        }
    }

    async runCheck(apiId: string) {
        const api = await this.apiRepository.findOne({
            where: { id: apiId },
            relations: { user: true }
        });

        if (!api) {
            this.removeCron(apiId);
            return;
        }

        if (!api.enabled) {
            this.removeCron(apiId);
            return;
        }

        const result = await this.check(
            api.url,
            api.requestMethod as HttpMethod,
            api.requestBody,
            api.expectedBody
        );

        let status: ApiStatus;
        let error = result.error;

        if (!result.ok && !result.responseTimeMs) {
            status = 'DOWN';
        } else if (!result.ok && result.responseTimeMs) {
            status = 'ERROR';
        } else if ((result.responseTimeMs as number) > api.slowThresholdMs) {
            status = 'SLOW';
            error = `Slow response: ${Math.round(result.responseTimeMs as number)}ms (threshold ${api.slowThresholdMs}ms)`;
        } else {
            status = 'UP';
        }

        const failures = status === 'DOWN' ? api.consecutiveFailures + 1 : 0;
        const slowChecks = status === 'SLOW' ? api.consecutiveSlowChecks + 1 : 0;

        const downAlertWasSent = api.consecutiveFailures >= api.errorsToAlert;
        const slowAlertWasSent = api.consecutiveSlowChecks >= api.errorsToAlert;

        await this.apiLogRepository.save(
            this.apiLogRepository.create({
                api,
                status,
                statusCode: result.statusCode,
                responseTimeMs: result.responseTimeMs,
                responseBody: result.responseBody,
                error
            })
        );

        if (
            api.status !== status ||
            api.consecutiveFailures !== failures ||
            api.consecutiveSlowChecks !== slowChecks
        ) {
            await this.apiRepository.update(
                { id: api.id, enabled: true },
                { status, consecutiveFailures: failures, consecutiveSlowChecks: slowChecks }
            );
        }

        if (status === 'DOWN') {
            if (api.alertOnDown) {
                this.alertIfNeeded(api, failures, error);
            }
        } else if (downAlertWasSent && api.alertOnDown) {
            this.logger.log(
                `RECOVERED: [${api.name}] is ${status} again after ${api.consecutiveFailures} failed checks`
            );
            void this.notifications.sendRecovered(api, status, api.consecutiveFailures);
        }

        if (status === 'SLOW') {
            if (api.alertOnSlow) {
                this.slowWarningIfNeeded(api, slowChecks, result.responseTimeMs as number);
            }
        } else if (status === 'UP' && slowAlertWasSent && api.alertOnSlow) {
            this.logger.log(
                `RECOVERED: [${api.name}] is back to normal speed after ${api.consecutiveSlowChecks} slow checks`
            );
            void this.notifications.sendSlowRecovered(api, api.consecutiveSlowChecks);
        }
    }

    private slowWarningIfNeeded(api: Api, slowChecks: number, responseTimeMs: number) {
        if (slowChecks % api.errorsToAlert !== 0) {
            return;
        }

        this.logger.warn(
            `WARNING: [${api.name}] was slow ${slowChecks} times in a row ` +
                `(last: ${Math.round(responseTimeMs)}ms, threshold: ${api.slowThresholdMs}ms)`
        );
        void this.notifications.sendSlowWarning(api, slowChecks, responseTimeMs);
    }

    private alertIfNeeded(api: Api, failures: number, lastError: string | null) {
        if (failures % api.errorsToAlert !== 0) {
            return;
        }

        this.logger.warn(`ALERT: [${api.name}] failed ${failures} times in a row`);
        void this.notifications.sendDownAlert(api, failures, lastError);
    }

    async addApi(apiData: ApiDto, userId: string) {
        const { url, requestMethod, requestBody, expectedBody } = apiData;

        this.assertBodyRules(requestMethod, requestBody, expectedBody);

        const apiExists = await this.apiRepository.exists({
            where: { user: { id: userId }, url, requestMethod }
        });

        if (apiExists) {
            throw new BadRequestException(
                `Api ${apiData.requestMethod} check for url: ${apiData.url} already exists`
            );
        }

        const newApi = this.apiRepository.create({
            ...apiData,
            status: 'UNKNOWN',
            user: { id: userId }
        });

        const savedApi = await this.apiRepository.save(newApi);

        this.scheduleApiCron(savedApi, true);

        return savedApi;
    }

    async getApis(userId: string) {
        return this.apiRepository.find({
            where: { user: { id: userId } },
            order: { name: 'ASC' }
        });
    }

    async getApi(id: string, userId: string) {
        const api = await this.apiRepository.findOne({
            where: { id, user: { id: userId } }
        });

        if (!api) {
            throw new NotFoundException('API not found');
        }

        return api;
    }

    async updateApi(id: string, userId: string, apiData: UpdateApiDto) {
        const api = await this.getApi(id, userId);

        // Validate the resulting state, not just the patch (e.g. method -> GET while a body is stored)
        this.assertBodyRules(
            apiData.requestMethod ?? api.requestMethod,
            apiData.requestBody !== undefined ? apiData.requestBody : api.requestBody,
            apiData.expectedBody !== undefined ? apiData.expectedBody : api.expectedBody
        );

        const targetChanged =
            (apiData.url !== undefined && apiData.url !== api.url) ||
            (apiData.requestMethod !== undefined && apiData.requestMethod !== api.requestMethod) ||
            (apiData.requestBody !== undefined && apiData.requestBody !== api.requestBody) ||
            (apiData.expectedBody !== undefined && apiData.expectedBody !== api.expectedBody);
        const intervalChanged =
            apiData.intervalMinutes !== undefined &&
            apiData.intervalMinutes !== api.intervalMinutes;

        Object.assign(api, apiData);

        if (targetChanged && api.enabled) {
            api.status = 'UNKNOWN';
            api.consecutiveFailures = 0;
            api.consecutiveSlowChecks = 0;
        }

        const savedApi = await this.apiRepository.save(api);

        if (intervalChanged && api.enabled) {
            this.scheduleApiCron(savedApi);
        }

        return savedApi;
    }

    async deleteApi(id: string, userId: string) {
        const api = await this.getApi(id, userId);

        this.removeCron(api.id);

        await this.apiRepository.remove(api);
    }

    async pauseApi(id: string, userId: string) {
        const api = await this.getApi(id, userId);

        if (!api.enabled) {
            return api.enabled;
        }

        api.enabled = false;
        api.status = 'PAUSED';

        const saved = await this.apiRepository.save(api);
        this.removeCron(id);

        return saved;
    }

    async resumeApi(id: string, userId: string) {
        const api = await this.getApi(id, userId);

        if (api.enabled) {
            return api.enabled;
        }

        api.enabled = true;
        api.status = 'UNKNOWN';

        const saved = await this.apiRepository.save(api);
        this.scheduleApiCron(saved, true);

        return saved;
    }

    async getLog(id: string, logId: string, userId: string) {
        await this.getApi(id, userId);

        const log = await this.apiLogRepository.findOne({
            where: {
                id: logId,
                api: { id, user: { id: userId } }
            }
        });

        if (!log) {
            throw new NotFoundException('Log not found');
        }

        return log;
    }

    async getLogs(id: string, userId: string, query: LogsQueryDto) {
        await this.getApi(id, userId);

        const { limit, offset, status } = query;

        const where: any = {
            api: { id }
        };

        if (status) {
            where.status = status;
        }

        const [items, total] = await this.apiLogRepository.findAndCount({
            where,
            select: {
                id: true,
                createdAt: true,
                status: true,
                statusCode: true,
                responseTimeMs: true,
                error: true
            },
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset
        });

        return { items, total, limit, offset };
    }

    async getPercentages(id: string, userId: string) {
        await this.getApi(id, userId);

        const stats = await this.apiLogRepository
            .createQueryBuilder('log')
            .select('log.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .where('log.apiId = :id', { id })
            .groupBy('log.status')
            .getRawMany();

        const total = stats.reduce((sum, item) => sum + Number(item.count), 0);

        return { stats: stats, total: total };
    }

    removeCron(apiId: string) {
        const jobName = `cron-api-${apiId}`;

        if (this.schedulerRegistry.doesExist('cron', jobName)) {
            this.schedulerRegistry.deleteCronJob(jobName);
        }
    }

    scheduleApiCron(api: Api, runImmediately = false) {
        const { id, name, intervalMinutes } = api;
        const jobName = `cron-api-${id}`;

        this.removeCron(id);

        const cronExpression = `*/${intervalMinutes} * * * *`;

        const tick = () => this.runCheck(id).catch((e) => this.logger.error(e));
        const job = new CronJob(cronExpression, tick);

        this.schedulerRegistry.addCronJob(jobName, job);
        job.start();

        if (runImmediately) {
            void tick();
        }

        console.log(`Scheduled cron job for [${name}] with expression: ${cronExpression}`);
    }
}
