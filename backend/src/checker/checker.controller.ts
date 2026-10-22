import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CheckerService } from './checker.service';
import { AuthGuard } from '../auth/auth.guard';
import { UrlDto } from './dtos/url.dto';

@Controller('checker')
export class CheckerController {
    constructor(private readonly checkerService: CheckerService) {}

    @Post('ping')
    @UseGuards(AuthGuard)
    async ping(@Body() url: UrlDto) {
		return this.checkerService.ping(url.url);
	}
}
