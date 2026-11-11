import { Body, Controller, Delete, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
import { VerifyEmailDto } from './dtos/verify-email.dto';
import { ResendVerificationDto } from './dtos/resend-verification.dto';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('signup')
    async signUp(@Body() signupData: SignupDto) {
        return this.authService.signUp(signupData);
    }

    @Post('login')
    async login(@Body() loginData: LoginDto) {
        return this.authService.login(loginData);
    }

    @Post('verify-email')
    @HttpCode(HttpStatus.OK)
    async verifyEmail(@Body() { token }: VerifyEmailDto) {
        return this.authService.verifyEmail(token);
    }

    @Post('resend-verification')
    @HttpCode(HttpStatus.OK)
    async resendVerification(@Body() { email }: ResendVerificationDto) {
        return this.authService.resendVerification(email);
    }

    @Delete('me')
    @UseGuards(AuthGuard)
    async deleteMe(@CurrentUser() user: any) {
        return this.authService.deleteUserById(user.sub);
    }

    @Post('checkToken')
    @UseGuards(AuthGuard)
    async checkToken() {
        return this.authService.checkToken();
    }
}
