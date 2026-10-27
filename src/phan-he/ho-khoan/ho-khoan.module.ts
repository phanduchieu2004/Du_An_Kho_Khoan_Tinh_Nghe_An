import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatPhang } from '../cat-phang/thuc-the/cat-phang.entity.js';
import { CongTrinh } from '../cong-trinh/thuc-the/cong-trinh.entity.js';
import { GiaTriTrungBinhLop } from '../gia-tri-trung-binh-lop/thuc-the/gia-tri-trung-binh-lop.entity.js';
import { LopDat } from '../lop-dat/thuc-the/lop-dat.entity.js';
import { MauThiNghiem } from '../mau-thi-nghiem/thuc-the/mau-thi-nghiem.entity.js';
import { ThanhPhanHat } from '../thanh-phan-hat/thuc-the/thanh-phan-hat.entity.js';
import { HoKhoan } from './thuc-the/ho-khoan.entity.js';
import { HoKhoanController } from './ho-khoan.controller.js';
import { HoKhoanService } from './ho-khoan.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [
    NguoiDungModule,
    TypeOrmModule.forFeature([
      HoKhoan,
      CongTrinh,
      LopDat,
      MauThiNghiem,
      ThanhPhanHat,
      CatPhang,
      GiaTriTrungBinhLop,
    ]),
  ],
  controllers: [HoKhoanController],
  providers: [HoKhoanService],
  exports: [HoKhoanService],
})
export class HoKhoanModule {}