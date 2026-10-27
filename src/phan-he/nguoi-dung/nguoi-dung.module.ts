import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NguoiDung } from './thuc-the/nguoi-dung.entity.js';
import { NguoiDungController } from './nguoi-dung.controller.js';
import { NguoiDungService } from './nguoi-dung.service.js';
import { AssignedAreaService } from './khu-vuc-phan-cong.service.js';
import { QuanLyKhuVucController } from './quan-ly-khu-vuc.controller.js';
import { UyQuyenModule } from '../uy-quyen/uy-quyen.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([NguoiDung]), UyQuyenModule],
  controllers: [NguoiDungController, QuanLyKhuVucController],
  providers: [NguoiDungService, AssignedAreaService],
  exports: [NguoiDungService, AssignedAreaService],
})
export class NguoiDungModule {}