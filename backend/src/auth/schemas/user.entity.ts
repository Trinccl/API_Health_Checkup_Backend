import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Index } from 'typeorm';
import { Api } from '../../checker/schemas/api.entity';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    name: string;

    @Column({ unique: true, nullable: false })
    email: string;

    @Column({ nullable: false })
    password: string;

    @Column({ default: false })
    emailVerified: boolean;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    verificationTokenHash: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    verificationExpiresAt: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    verificationSentAt: Date | null;

    @OneToMany(() => Api, (api) => api.user, { cascade: true })
    apis: Api[];
}
