import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from '../../../src/auth/dtos/login.dto';

const validate_ = (data: Record<string, unknown>) =>
    validate(plainToInstance(LoginDto, data));

describe('LoginDto', () => {
    it('accepts valid data', async () => {
        const errors = await validate_({
            email: 'john@example.com',
            password: 'anything'
        });
        expect(errors).toHaveLength(0);
    });

    it('rejects an invalid email', async () => {
        const errors = await validate_({ email: 'nope', password: 'x' });
        expect(errors.map((e) => e.property)).toEqual(['email']);
    });

    it('rejects a missing password', async () => {
        const errors = await validate_({ email: 'john@example.com' });
        expect(errors.map((e) => e.property)).toEqual(['password']);
    });

    it('rejects a non-string password', async () => {
        const errors = await validate_({
            email: 'john@example.com',
            password: 12345678
        });
        expect(errors.map((e) => e.property)).toEqual(['password']);
    });
});
