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

    // default: true only affects rows that already exist (they are grandfathered in);
    // signUp always sets this to false explicitly for new accounts.
    @Column({ default: true })
    emailVerified: boolean;

    // sha256 of the token that was emailed; the raw token is never stored
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
