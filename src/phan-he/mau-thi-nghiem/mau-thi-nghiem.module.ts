import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MauThiNghiem } from './thuc-the/mau-thi-nghiem.entity.js';
import { MauThiNghiemController } from './mau-thi-nghiem.controller.js';
import { MauThiNghiemService } from './mau-thi-nghiem.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule, TypeOrmModule.forFeature([MauThiNghiem])],
  controllers: [MauThiNghiemController],
  providers: [MauThiNghiemService],
})
export class MauThiNghiemModule {}