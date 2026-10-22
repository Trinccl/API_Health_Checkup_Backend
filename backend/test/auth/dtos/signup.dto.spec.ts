import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from '../../../src/auth/dtos/signup.dto';

const validate_ = (data: Record<string, unknown>) =>
    validate(plainToInstance(SignupDto, data));

const valid = {
    name: 'John',
    email: 'john@example.com',
    password: 'Passw0rd'
};

describe('SignupDto', () => {
    it('accepts valid data', async () => {
        expect(await validate_(valid)).toHaveLength(0);
    });

    it('accepts a password without symbols', async () => {
        expect(
            await validate_({ ...valid, password: 'Abcdefg1' })
        ).toHaveLength(0);
    });

    it('rejects a non-string name', async () => {
        const errors = await validate_({ ...valid, name: 123 });
        expect(errors.map((e) => e.property)).toEqual(['name']);
    });

    it('rejects a missing name', async () => {
        const { name, ...rest } = valid;
        const errors = await validate_(rest);
        expect(errors.map((e) => e.property)).toContain('name');
    });

    it('rejects an invalid email', async () => {
        const errors = await validate_({ ...valid, email: 'not-an-email' });
        expect(errors.map((e) => e.property)).toEqual(['email']);
    });

    it.each([
        ['too short', 'Ab1'],
        ['no uppercase', 'password1'],
        ['no lowercase', 'PASSWORD1'],
        ['no number', 'Password']
    ])('rejects a weak password (%s)', async (_label, password) => {
        const errors = await validate_({ ...valid, password });
        expect(errors.map((e) => e.property)).toEqual(['password']);
    });
});
