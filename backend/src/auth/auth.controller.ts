import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto } from './dtos/signup.dto';
import { LoginDto } from './dtos/login.dto';
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
