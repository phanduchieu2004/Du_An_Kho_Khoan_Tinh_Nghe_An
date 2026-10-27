import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('gia_tri_trung_binh_lop')
export class GiaTriTrungBinhLop {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  lop_dat_id: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  suc_chiu_tai_ro: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_nen_lun_a: string | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;
}