import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { LoginRoleSlug } from '../../../xac-thuc/vai-tro-dang-nhap.js';
import type { AreaGeometry } from '../khu-vuc-phan-cong.util.js';

@Entity('nguoi_dung')
export class NguoiDung {
  @PrimaryGeneratedColumn({ name: 'ma_nguoi_dung' })
  ma_nguoi_dung: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  ten_dang_nhap: string;

  @Column({ type: 'varchar', length: 255, select: false })
  mat_khau: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ho_ten: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  dia_chi: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  so_dien_thoai: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ma_ky_su: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  chuyen_nganh: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  don_vi_cong_tac: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  so_chung_chi_hanh_nghe: string | null;

  @Column({ type: 'varchar', length: 20, default: 'CHO_DUYET' })
  trang_thai: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  ngay_tao: Date;

  @Column({ type: 'timestamp', nullable: true })
  lan_dang_nhap_cuoi: Date | null;

  @Column({ type: 'text', nullable: true })
  khu_vuc_duoc_xem: string | null;

  @Column({ type: 'jsonb', nullable: true })
  khu_vuc_phan_cong_ranh_gioi: AreaGeometry | null;

  @Column({ type: 'double precision', nullable: true })
  khu_vuc_phan_cong_vi_do: number | null;

  @Column({ type: 'double precision', nullable: true })
  khu_vuc_phan_cong_kinh_do: number | null;

  @Column({ type: 'date', nullable: true })
  khu_vuc_phan_cong_tu_ngay: string | null;

  @Column({ type: 'date', nullable: true })
  khu_vuc_phan_cong_den_ngay: string | null;

  @Column({
    type: 'varchar',
    length: 32,
    array: true,
    default: () => "ARRAY['nguoi-xem-ban-do']::varchar(32)[]",
  })
  cong_vai_tro: LoginRoleSlug[];

  @Column({ type: 'boolean', default: true })
  duoc_dang_nhap: boolean;
}