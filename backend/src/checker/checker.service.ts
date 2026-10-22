import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class CheckerService {
    private static readonly TIMEOUT_MS = 5000;

    async ping(url: string): Promise<{ time: number }> {
        const start = performance.now();

        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(CheckerService.TIMEOUT_MS),
        }).catch(() => null);

        if (!response?.ok) {
            throw new BadRequestException(['url must be a reachable URL address']);
        }

        return { time: performance.now() - start };
    }
}