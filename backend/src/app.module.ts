import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './auth/schemas/user.entity';
import { ConfigModule } from '@nestjs/config';
import { CheckerModule } from './checker/checker.module';
import { ScheduleModule } from '@nestjs/schedule';
import { Api } from './checker/schemas/api.entity';
import { ApiLog } from './checker/schemas/api-log.entity';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: 'localhost',
            port: 5432,
            username: 'postgres',
            password: 'pass',
            database: 'postgres',
            entities: [User, Api, ApiLog],
            synchronize: true
        }),
        AuthModule,
        CheckerModule
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
