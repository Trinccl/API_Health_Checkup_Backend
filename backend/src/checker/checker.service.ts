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
import { ApiStatus, REQUEST_TIMEOUT_MS } from './checker.constants';
import { NotificationService } from '../notification/notification.service';

type CheckResult = {
    ok: boolean;
    statusCode: number | null;
    responseTimeMs: number | null;
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
        const apis = await this.apiRepository.find();
        apis.forEach((api) => this.scheduleApiCron(api));
    }

    async ping(url: string, requestMethod: HttpMethod = 'GET'): Promise<{ time: number }> {
        const result = await this.check(url, requestMethod);

        if (!result.ok) {
            throw new BadRequestException(['url must be a reachable URL address']);
        }

        return { time: result.responseTimeMs as number };
    }

    private async check(url: string, method: HttpMethod): Promise<CheckResult> {
        const start = performance.now();

        try {
            const response = await fetch(url, {
                method,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
            });

            return {
                ok: response.ok,
                statusCode: response.status,
                responseTimeMs: performance.now() - start,
                error: response.ok ? null : `HTTP ${response.status}`
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

        const result = await this.check(api.url, api.requestMethod as HttpMethod);

        let status: ApiStatus;
        let error = result.error;

        if (!result.ok) {
            status = 'DOWN';
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
                error
            })
        );

        if (
            api.status !== status ||
            api.consecutiveFailures !== failures ||
            api.consecutiveSlowChecks !== slowChecks
        ) {
            await this.apiRepository.update(api.id, {
                status,
                consecutiveFailures: failures,
                consecutiveSlowChecks: slowChecks
            });
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
        const { url, requestMethod } = apiData;

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

        const targetChanged =
            (apiData.url !== undefined && apiData.url !== api.url) ||
            (apiData.requestMethod !== undefined && apiData.requestMethod !== api.requestMethod);
        const intervalChanged =
            apiData.intervalMinutes !== undefined &&
            apiData.intervalMinutes !== api.intervalMinutes;

        Object.assign(api, apiData);

        if (targetChanged) {
            api.status = 'UNKNOWN';
            api.consecutiveFailures = 0;
            api.consecutiveSlowChecks = 0;
        }

        const savedApi = await this.apiRepository.save(api);

        if (intervalChanged) {
            this.scheduleApiCron(savedApi);
        }

        return savedApi;
    }

    async deleteApi(id: string, userId: string) {
        const api = await this.getApi(id, userId);

        this.removeCron(api.id);

        await this.apiRepository.remove(api);
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
            order: { createdAt: 'DESC' },
            take: limit,
            skip: offset
        });

        return { items, total, limit, offset };
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
