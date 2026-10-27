import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('uy_quyen_he_thong')
export class UyQuyenHeThong {
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  @Column({ type: 'text', array: true, name: 'quyen_duoc_cap' })
  quyen_duoc_cap: string[];
}
