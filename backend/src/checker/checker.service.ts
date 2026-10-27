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
        private readonly schedulerRegistry: SchedulerRegistry
    ) {}

    async onModuleInit() {
        console.log('init not implemented');
        //schedule all crons? ig?
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
        throw new Error('Method not implemented.');
    }

    async addApi(apiData: ApiDto, userId: string) {
        const apiExists = await this.apiRepository.exists({
            where: { user: { id: userId }, url: apiData.url, requestMethod: apiData.requestMethod }
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

        // TODO: schedule cron for savedApi

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
            // schedule cron
        }

        return savedApi;
    }

    async deleteApi(id: string, userId: string) {
        const api = await this.getApi(id, userId);

        // remove cron

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
}
