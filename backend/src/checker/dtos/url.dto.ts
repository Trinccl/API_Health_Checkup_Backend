import { IsUrl, IsOptional, IsIn } from 'class-validator';

import type { HttpMethod } from './api.dto';

export class UrlDto {
    @IsUrl()
    url: string;

    @IsOptional()
    @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], {
        message:
            'Method must be a valid HTTP request method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)'
    })
    requestMethod: HttpMethod;
}
