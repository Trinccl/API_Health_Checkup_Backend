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
            return {
                ok: false,
                statusCode: null,
                responseTimeMs: null,
                error:
                    e?.name === 'TimeoutError'
                        ? `Timeout after ${REQUEST_TIMEOUT_MS}ms`
                        : (e?.message ?? 'Unknown error')
            };
        }
    }

    async runCheck(apiId: string) {
        throw new Error('Method not implemented.');
    }

    async addApi(apiData: ApiDto, userId: string) {
        const { url } = apiData;

        const apiAlreadyThere = await this.apiRepository.exists({
            where: { user: { id: userId }, url }
        });

        if (apiAlreadyThere) {
            throw new BadRequestException('API already being checked');
        }

        const newApi = this.apiRepository.create({
            ...apiData,
            user: { id: userId }
        });

        await this.apiRepository.save(newApi);

        return { successMessage: 'Successfully added the database   ' };
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
        throw new Error('Method not implemented.');
    }

    async deleteApi(id: string, userId: string) {
        throw new Error('Method not implemented.');
    }

    async getLogs(id: string, userId: string, query: LogsQueryDto) {
        throw new Error('Method not implemented.');
    }
}
