import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('uy_quyen_tai_khoan')
export class UyQuyenTaiKhoan {
  @PrimaryColumn({ type: 'integer', name: 'ma_nguoi_dung' })
  ma_nguoi_dung: number;

  @Column({ type: 'text', array: true, name: 'quyen_duoc_cap' })
  quyen_duoc_cap: string[];

  @Column({ type: 'jsonb', name: 'nut_theo_trang', default: () => "'{}'::jsonb" })
  nut_theo_trang: Record<string, string[]>;

  @Column({ type: 'jsonb', name: 'che_do_quyen', default: () => "'{}'::jsonb" })
  che_do_quyen: Record<string, string>;
}
