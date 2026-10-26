import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class LogsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @Min(1)
    @Max(200)
    @IsInt()
    limit: number = 50;

    @IsOptional()
    @Type(() => Number)
    @Min(0)
    @IsInt()
    offset: number = 0;

    @IsOptional()
    @IsIn(['UP', 'SLOW', 'DOWN'])
    status?: 'UP' | 'SLOW' | 'DOWN';
}
