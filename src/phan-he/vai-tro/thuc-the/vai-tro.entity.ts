import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('vai_tro')
export class VaiTro {
  @PrimaryGeneratedColumn({ name: 'ma_vai_tro' })
  ma_vai_tro: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  ten_vai_tro: string;
}