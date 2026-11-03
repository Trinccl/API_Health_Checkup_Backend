import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiDto } from '../../../src/checker/dtos/api.dto';
import { UpdateApiDto } from '../../../src/checker/dtos/update-api.dto';
import { UrlDto } from '../../../src/checker/dtos/url.dto';
import {
    MAX_EXPECTED_BODY_LENGTH,
    MAX_REQUEST_BODY_LENGTH
} from '../../../src/checker/checker.constants';

const toDto = <T extends object>(cls: new () => T, data: Record<string, unknown>) =>
    plainToInstance(cls, data);
const errorsOf = async <T extends object>(cls: new () => T, data: Record<string, unknown>) =>
    (await validate(toDto(cls, data))).map((e) => e.property);

const validApi = {
    name: 'My API',
    url: 'https://example.com/health',
    slowThresholdMs: 1000,
    errorsToAlert: 3,
    requestMethod: 'POST',
    intervalMinutes: 5
};

describe.each([
    ['requestBody', MAX_REQUEST_BODY_LENGTH],
    ['expectedBody', MAX_EXPECTED_BODY_LENGTH]
])('ApiDto.%s', (field, maxLength) => {
    it('is optional', async () => {
        expect(await errorsOf(ApiDto, validApi)).toEqual([]);
    });

    it('accepts a string', async () => {
        expect(await errorsOf(ApiDto, { ...validApi, [field]: '{"ok":true}' })).toEqual([]);
    });

    it('accepts null (used to clear the field)', async () => {
        expect(await errorsOf(ApiDto, { ...validApi, [field]: null })).toEqual([]);
    });

    it('converts an empty string to null', async () => {
        const dto = toDto(ApiDto, { ...validApi, [field]: '' });
        expect((dto as any)[field]).toBeNull();
        expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects non-string values', async () => {
        expect(await errorsOf(ApiDto, { ...validApi, [field]: { a: 1 } })).toEqual([field]);
        expect(await errorsOf(ApiDto, { ...validApi, [field]: 123 })).toEqual([field]);
    });

    it('accepts exactly the max length and rejects one more', async () => {
        expect(await errorsOf(ApiDto, { ...validApi, [field]: 'a'.repeat(maxLength) })).toEqual([]);
        expect(await errorsOf(ApiDto, { ...validApi, [field]: 'a'.repeat(maxLength + 1) })).toEqual(
            [field]
        );
    });

    it('keeps whitespace untouched', () => {
        const dto = toDto(ApiDto, { ...validApi, [field]: '  padded  ' });
        expect((dto as any)[field]).toBe('  padded  ');
    });
});

describe('UrlDto bodies', () => {
    const base = { url: 'https://example.com' };

    it('accepts a url with no body fields', async () => {
        expect(await errorsOf(UrlDto, base)).toEqual([]);
    });

    it('accepts requestBody and expectedBody strings', async () => {
        expect(
            await errorsOf(UrlDto, {
                ...base,
                requestMethod: 'POST',
                requestBody: 'x',
                expectedBody: 'y'
            })
        ).toEqual([]);
    });

    it('rejects non-string and over-long values', async () => {
        expect(await errorsOf(UrlDto, { ...base, requestBody: 5 })).toEqual(['requestBody']);
        expect(
            await errorsOf(UrlDto, {
                ...base,
                expectedBody: 'a'.repeat(MAX_EXPECTED_BODY_LENGTH + 1)
            })
        ).toEqual(['expectedBody']);
    });

    it('converts empty strings to null', () => {
        const dto = toDto(UrlDto, { ...base, requestBody: '', expectedBody: '' });
        expect(dto.requestBody).toBeNull();
        expect(dto.expectedBody).toBeNull();
    });
});

describe('UpdateApiDto bodies', () => {
    it('accepts an empty patch', async () => {
        expect(await errorsOf(UpdateApiDto, {})).toEqual([]);
    });

    it('accepts setting and clearing the bodies', async () => {
        expect(await errorsOf(UpdateApiDto, { requestBody: 'abc', expectedBody: null })).toEqual(
            []
        );
        expect(await errorsOf(UpdateApiDto, { requestBody: null, expectedBody: 'abc' })).toEqual(
            []
        );
    });

    it('still validates the body fields', async () => {
        expect(await errorsOf(UpdateApiDto, { requestBody: 42 })).toEqual(['requestBody']);
    });

    it('turns empty strings into null', () => {
        const dto = toDto(UpdateApiDto, { requestBody: '', expectedBody: '' });
        expect(dto.requestBody).toBeNull();
        expect(dto.expectedBody).toBeNull();
    });
});
