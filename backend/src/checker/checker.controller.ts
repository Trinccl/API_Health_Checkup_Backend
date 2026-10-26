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

@Controller('checker')
@UseGuards(AuthGuard)
export class CheckerController {
    constructor(private readonly checkerService: CheckerService) {}

    @Post('ping')
    async ping(@Body() url: UrlDto) {
        return this.checkerService.ping(url.url);
    }

    @Post('apis')
    async addApi(@Body() apiData: ApiDto, @CurrentUser() user: any) {
        return this.checkerService.addApi(apiData, user.sub);
    }

    @Get('apis')
    async getApis(@CurrentUser() user: any) {
        return this.checkerService.getApis(user.sub);
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
}
