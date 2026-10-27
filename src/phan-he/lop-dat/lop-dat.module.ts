import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LopDat } from './thuc-the/lop-dat.entity.js';
import { LopDatController } from './lop-dat.controller.js';
import { LopDatService } from './lop-dat.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule, TypeOrmModule.forFeature([LopDat])],
  controllers: [LopDatController],
  providers: [LopDatService],
})
export class LopDatModule {}