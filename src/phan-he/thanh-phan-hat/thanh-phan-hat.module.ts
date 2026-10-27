import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ThanhPhanHat } from './thuc-the/thanh-phan-hat.entity.js';
import { ThanhPhanHatController } from './thanh-phan-hat.controller.js';
import { ThanhPhanHatService } from './thanh-phan-hat.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule, TypeOrmModule.forFeature([ThanhPhanHat])],
  controllers: [ThanhPhanHatController],
  providers: [ThanhPhanHatService],
})
export class ThanhPhanHatModule {}