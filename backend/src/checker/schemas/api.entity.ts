import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../../auth/schemas/user.entity';
import { ApiLog } from './api-log.entity';

@Entity('apis')
export class Api {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    name: string;

    @Column({ nullable: false })
    url: string;

    @Column({ nullable: false })
    slowThresholdMs: number;

    @Column({ nullable: false })
    errorsToAlert: number;

    @Column({ nullable: false })
    requestMethod: string;

    @Column({ nullable: false })
    intervalMinutes: number;

    @Column({ default: 'UNKNOWN' })
    status: string; // 'UP' | 'SLOW' | 'DOWN' | 'UNKNOWN'

    @Column({ default: 0 })
    consecutiveFailures: number;

    @Column({ default: 0 })
    consecutiveSlowChecks: number;

    @ManyToOne(() => User, (user) => user.apis, { onDelete: 'CASCADE' })
    user: User;

    @OneToMany(() => ApiLog, (apiLog) => apiLog.api, { cascade: true })
    logs: ApiLog[];
}
