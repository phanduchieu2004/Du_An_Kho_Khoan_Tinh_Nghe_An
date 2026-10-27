import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('thanh_phan_hat')
export class ThanhPhanHat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  mau_id: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cuoi_dam_200_300: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  soi_150_200: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  soi_100_150: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_50_100: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_20_50: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_10_20: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_5_10: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_2_5: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_1_2: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_05_1: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_025_05: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_008_025: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_006_008: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_002_006: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_0006_002: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_0002_0006: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  hat_duoi_0002: string | null;
}