import { IsString, IsEmail, IsStrongPassword } from 'class-validator';

export class SignupDto {
    @IsString()
    name: string;

    @IsEmail()
    email: string;

    @IsStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 0
    })
    password: string;
}
