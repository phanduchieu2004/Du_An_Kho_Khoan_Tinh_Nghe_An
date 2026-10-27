import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cong_trinh')
export class CongTrinh {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  ten_cong_trinh: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  dia_diem: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  hang_muc: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  ghi_chu: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  ngay_tao: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  ngay_cap_nhat: Date | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  da_duyet: boolean;

  @Column({
    type: 'integer',
    nullable: true,
  })
  nguoi_tao: number | null;
}