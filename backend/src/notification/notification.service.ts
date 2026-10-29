import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { Api } from '../checker/schemas/api.entity';
import { ApiStatus } from '../checker/checker.constants';

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);
    private readonly transporter: Transporter;
    private readonly from: string;

    constructor(private readonly config: ConfigService) {
        const port = Number(this.config.get('SMTP_PORT') ?? 587);

        this.from = this.config.getOrThrow<string>('MAIL_FROM');
        this.transporter = createTransport({
            host: this.config.getOrThrow<string>('SMTP_HOST'),
            port,
            secure: port === 465,
            auth: {
                user: this.config.getOrThrow<string>('SMTP_USER'),
                pass: this.config.getOrThrow<string>('SMTP_PASS')
            },
            // a hanging SMTP server must not pile up pending promises
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
            socketTimeout: 15_000
        });
    }

    async onModuleInit() {
        try {
            await this.transporter.verify();
            this.logger.log('SMTP connection verified');
        } catch (e) {
            this.logger.error('SMTP verification failed', e instanceof Error ? e.message : e);
        }
    }

    async sendDownAlert(api: Api, failures: number, lastError: string | null) {
        await this.send(
            api,
            `[DOWN] ${api.name}`,
            [
                `${api.name} failed ${failures} checks in a row.`,
                '',
                `Endpoint: ${api.requestMethod} ${api.url}`,
                `Last error: ${lastError ?? 'unknown'}`,
                `Check interval: every ${api.intervalMinutes} min`
            ].join('\n')
        );
    }

    async sendSlowWarning(api: Api, slowChecks: number, responseTimeMs: number) {
        await this.send(
            api,
            `[SLOW] ${api.name}`,
            [
                `${api.name} was slow ${slowChecks} checks in a row.`,
                '',
                `Endpoint: ${api.requestMethod} ${api.url}`,
                `Last response time: ${Math.round(responseTimeMs)}ms`,
                `Slow threshold: ${api.slowThresholdMs}ms`
            ].join('\n')
        );
    }

    async sendRecovered(api: Api, status: ApiStatus, failedChecks: number) {
        const detail =
            status === 'SLOW'
                ? 'It is responding again, but still slower than your threshold.'
                : 'It is back up and responding normally.';

        await this.send(
            api,
            `[RECOVERED] ${api.name}`,
            [
                `${api.name} recovered after ${failedChecks} failed checks.`,
                detail,
                '',
                `Endpoint: ${api.requestMethod} ${api.url}`
            ].join('\n')
        );
    }

    async sendSlowRecovered(api: Api, slowChecks: number) {
        await this.send(
            api,
            `[RECOVERED] ${api.name} is back to normal speed`,
            [
                `${api.name} is no longer slow after ${slowChecks} slow checks.`,
                '',
                `Endpoint: ${api.requestMethod} ${api.url}`
            ].join('\n')
        );
    }

    private async send(api: Api, subject: string, text: string) {
        const to = api.user?.email;

        if (!to) {
            this.logger.warn(`No recipient for [${api.name}], skipping "${subject}"`);
            return;
        }

        try {
            await this.transporter.sendMail({ from: this.from, to, subject, text });
        } catch (e) {
            this.logger.error(
                `Failed to send "${subject}" to ${to}`,
                e instanceof Error ? e.stack : e
            );
        }
    }

    async sendTestEmail(to: string) {
        try {
            const info = await this.transporter.sendMail({
                from: this.from,
                to,
                subject: '[TEST] mail check',
                text: 'If you can read this, it works'
            });

            return { sent: true, to, messageId: info.messageId, response: info.response };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this.logger.error(`Test email to ${to} failed`, e instanceof Error ? e.stack : e);
            throw new BadGatewayException(`SMTP send failed: ${message}`);
        }
    }
}
