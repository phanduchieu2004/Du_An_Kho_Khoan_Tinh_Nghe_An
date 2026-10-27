import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('lop_dat')
export class LopDat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  cong_trinh_id: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ten_lop: string | null;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;
}