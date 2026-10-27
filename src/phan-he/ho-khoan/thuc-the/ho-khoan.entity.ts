import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ho_khoan')
export class HoKhoan {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cong_trinh_id: number;

  @Column({
    length: 20,
  })
  ma_ho_khoan: string;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  x_vn2000: string | null;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 4,
    nullable: true,
  })
  y_vn2000: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 6,
    nullable: true,
  })
  latitude: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 6,
    nullable: true,
  })
  longitude: string | null;

}