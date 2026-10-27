import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('mau_thi_nghiem')
export class MauThiNghiem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  ho_khoan_id: number | null;

  @Column({ type: 'integer', nullable: true })
  lop_dat_id: number | null;

  @Column({ type: 'integer', nullable: true })
  stt: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  so_hieu_mau: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  do_sau_tu: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  do_sau_den: string | null;

  @Column({ type: 'integer', nullable: true })
  so_thi_nghiem: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  do_am_tu_nhien_w: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  khoi_luong_the_tich_tu_nhien_g: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  khoi_luong_the_tich_kho_gc: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  khoi_luong_the_tich_kho_max: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  khoi_luong_the_tich_kho_min: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  gioi_han_chay_wl: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  gioi_han_deo_wp: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  chi_so_deo_ip: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  chi_so_do_set_b: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  khoi_luong_rieng_d: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_rong_e0: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_rong_emax: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_rong_emin: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  do_rong_n: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  do_bao_hoa_g: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_nen_lun_a: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  mo_dun_bien_dang_e12: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  goc_noi_ma_sat_phi: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  luc_dinh_ket_c: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  goc_nghi_kho_ak: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  goc_nghi_uot_aw: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cuong_do_khang_nen_kho_rk: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  cuong_do_khang_nen_bao_hoa_rbh: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  he_so_hoa_mem_f: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 6, nullable: true })
  suc_chiu_tai_ro: string | null;

  @Column({ type: 'text', nullable: true })
  phan_loai_dat_da: string | null;
}