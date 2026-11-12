import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    Max,
    MaxLength,
    Min,
    IsObject
} from 'class-validator';
import {
    MAX_EXPECTED_BODY_LENGTH,
    MAX_REQUEST_BODY_LENGTH,
    REQUEST_TIMEOUT_MS
} from '../checker.constants';

// Empty strings are treated as "not set" so clients can clear a field with '' or null
export const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

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

    @IsOptional()
    @Min(1)
    @Max(59)
    @IsInt()
    intervalMinutes: number;

    @IsOptional()
    @IsBoolean()
    alertOnDown?: boolean;

    @IsOptional()
    @IsBoolean()
    alertOnSlow?: boolean;

    /** Raw body sent with each check. Not allowed for GET/HEAD. Sent as JSON if it parses as JSON. */
    @IsOptional()
    @Transform(emptyToNull)
    @MaxLength(MAX_REQUEST_BODY_LENGTH)
    @IsString()
    requestBody?: string | null;

    /** Check is marked as failed unless the response body contains this text. */
    @IsOptional()
    @Transform(emptyToNull)
    @MaxLength(MAX_EXPECTED_BODY_LENGTH)
    @IsString()
    expectedBody?: string | null;

    @IsOptional()
    @IsObject()
    requestHeaders?: Record<string, string> | null;
}
