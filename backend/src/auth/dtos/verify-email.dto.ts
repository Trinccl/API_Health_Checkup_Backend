import { Matches } from 'class-validator';

export class VerifyEmailDto {
    @Matches(/^[a-f0-9]{64}$/, { message: 'Invalid verification token' })
    token: string;
}
