import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
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

    @OneToMany(() => Api, (api) => api.user, { cascade: true })
    apis: Api[];
}
