import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cat_phang')
export class CatPhang {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  mau_id: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cap_ap_luc_025: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cap_ap_luc_05: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cap_ap_luc_1: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cap_ap_luc_2: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cap_ap_luc_4: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  goc_noi_ma_sat_phi: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  luc_dinh_ket_c: string | null;
}