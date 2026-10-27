import { IsIn, IsInt, IsNumber, IsString, IsUrl, Max, Min } from 'class-validator';
import { REQUEST_TIMEOUT_MS } from '../checker.constants';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export class ApiDto {
    @IsString()
    name: string;

    @IsUrl()
    url: string;

    @Max(REQUEST_TIMEOUT_MS)
    @Min(1)
    @IsNumber()
    slowThresholdMs: number;

    @Min(1)
    @IsInt()
    errorsToAlert: number;

    @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], {
        message:
            'Method must be a valid HTTP request method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)'
    })
    requestMethod: HttpMethod;

    @Min(1)
    @Max(59)
    @IsInt()
    intervalMinutes: number;
}
