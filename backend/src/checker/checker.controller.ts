import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards
} from '@nestjs/common';
import { CheckerService } from './checker.service';
import { AuthGuard } from '../auth/auth.guard';
import { UrlDto } from './dtos/url.dto';
import { ApiDto } from './dtos/api.dto';
import { UpdateApiDto } from './dtos/update-api.dto';
import { LogsQueryDto } from './dtos/logs-query.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from '../notification/notification.service';
import { Throttle } from '@nestjs/throttler';

@Controller('checker')
@UseGuards(AuthGuard)
export class CheckerController {
    constructor(
        private readonly checkerService: CheckerService,
        private readonly notifications: NotificationService
    ) {}

    @Throttle({
        default: {
            limit: 5,
            ttl: 60000
        }
    })
    @Post('ping')
    async ping(@Body() url: UrlDto) {
        return this.checkerService.ping(url);
    }

    @Post('apis')
    async addApi(@Body() apiData: ApiDto, @CurrentUser() user: any) {
        return this.checkerService.addApi(apiData, user.sub);
    }

    @Get('apis')
    async getApis(@CurrentUser() user: any) {
        return this.checkerService.getApis(user.sub);
    }

    @Get('/apis/apiStats')
    async getApiStats(@CurrentUser() user: any) {
        return this.checkerService.getApiPercentages(user.sub);
    }

    @Get('apis/:id')
    async getApi(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        return this.checkerService.getApi(id, user.sub);
    }

    @Patch('apis/:id')
    async updateApi(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() apiData: UpdateApiDto,
        @CurrentUser() user: any
    ) {
        return this.checkerService.updateApi(id, user.sub, apiData);
    }

    @Delete('apis/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async deleteApi(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        await this.checkerService.deleteApi(id, user.sub);
    }

    @Get('apis/:id/logs')
    async getLogs(
        @Param('id', ParseUUIDPipe) id: string,
        @Query() query: LogsQueryDto,
        @CurrentUser() user: any
    ) {
        return this.checkerService.getLogs(id, user.sub, query);
    }

    @Get('apis/:id/logs/:logId')
    async getLog(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('logId', ParseUUIDPipe) logId: string,
        @CurrentUser() user: any
    ) {
        return this.checkerService.getLog(id, logId, user.sub);
    }

    @Get('/apis/:id/stats')
    async getStats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        return this.checkerService.getPercentages(id, user.sub);
    }

    @Post('apis/:id/pause')
    async pauseApi(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        return this.checkerService.pauseApi(id, user.sub);
    }

    @Post('apis/:id/resume')
    async resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
        return this.checkerService.resumeApi(id, user.sub);
    }

    @Post('test-email')
    @HttpCode(HttpStatus.OK)
    async testEmail(@CurrentUser() user: any) {
        return this.notifications.sendTestEmail(user.email);
    }
}
