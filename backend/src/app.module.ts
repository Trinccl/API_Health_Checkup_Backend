import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './auth/schemas/user.entity';
import { ConfigModule } from '@nestjs/config';
import { CheckerModule } from './checker/checker.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: 'localhost',
            port: 5432,
            username: 'postgres',
            password: 'pass',
            database: 'postgres',
            entities: [User],
            synchronize: true
        }),
        AuthModule,
        CheckerModule
    ],
    controllers: [AppController],
    providers: [AppService]
})
export class AppModule {}
