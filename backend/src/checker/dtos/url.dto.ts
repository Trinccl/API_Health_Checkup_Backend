import { IsUrl, IsOptional, IsIn, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { emptyToNull } from './api.dto';
import type { HttpMethod } from './api.dto';
import { MAX_EXPECTED_BODY_LENGTH, MAX_REQUEST_BODY_LENGTH } from '../checker.constants';

export class UrlDto {
    @IsUrl()
    url: string;

    @IsOptional()
    @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], {
        message:
            'Method must be a valid HTTP request method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD)'
    })
    requestMethod?: HttpMethod;

    @IsOptional()
    @Transform(emptyToNull)
    @MaxLength(MAX_REQUEST_BODY_LENGTH)
    @IsString()
    requestBody?: string | null;

    @IsOptional()
    @Transform(emptyToNull)
    @MaxLength(MAX_EXPECTED_BODY_LENGTH)
    @IsString()
    expectedBody?: string | null;
}
