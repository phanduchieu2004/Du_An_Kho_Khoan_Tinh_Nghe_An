import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cong_trinh_tai_lieu')
export class CongTrinhTaiLieu {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  cong_trinh_id: number;

  @Column({ type: 'varchar', length: 100 })
  loai_tai_lieu: string;

  @Column({ type: 'varchar', length: 255 })
  ten_file: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  ten_luu_tru: string;

  @Column({ type: 'varchar', length: 255 })
  mime_type: string;

  @Column({ type: 'bigint' })
  kich_thuoc: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  ngay_tao: Date;
}
