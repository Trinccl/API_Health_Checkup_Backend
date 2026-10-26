import { Module } from '@nestjs/common';
import { CheckerService } from './checker.service';
import { CheckerController } from './checker.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Api } from './schemas/api.entity';
import { ApiLog } from './schemas/api-log.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Api, ApiLog]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_SECRET'),
                signOptions: { expiresIn: '1h' }
            })
        })
    ],
    controllers: [CheckerController],
    providers: [CheckerService]
})
export class CheckerModule {}
