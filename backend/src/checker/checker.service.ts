import { Injectable } from '@nestjs/common';

@Injectable()
export class CheckerService {
    async ping(url: string) {
        const time_start = performance.now();

        const response = await fetch(url);

        const time_end = performance.now();

        const time_delta = time_end - time_start;
        return { time: time_delta };
    }
}
