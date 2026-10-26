import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Api } from './api.entity';

@Entity('api_logs')
export class ApiLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @Column()
    status: string; // 'UP' | 'DOWN' | 'SLOW'

    @Column({ type: 'int', nullable: true })
    statusCode: number | null;

    @Column({ type: 'float', nullable: true })
    responseTimeMs: number | null;

    @Column({ type: 'text', nullable: true })
    error: string | null;

    @ManyToOne(() => Api, (api) => api.logs, { onDelete: 'CASCADE' })
    api: Api;
}
