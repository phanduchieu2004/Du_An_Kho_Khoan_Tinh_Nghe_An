import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GiaTriTrungBinhLop } from './thuc-the/gia-tri-trung-binh-lop.entity.js';
import { GiaTriTrungBinhLopController } from './gia-tri-trung-binh-lop.controller.js';
import { GiaTriTrungBinhLopService } from './gia-tri-trung-binh-lop.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule, TypeOrmModule.forFeature([GiaTriTrungBinhLop])],
  controllers: [GiaTriTrungBinhLopController],
  providers: [GiaTriTrungBinhLopService],
})
export class GiaTriTrungBinhLopModule {}