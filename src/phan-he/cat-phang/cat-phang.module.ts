import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatPhang } from './thuc-the/cat-phang.entity.js';
import { CatPhangController } from './cat-phang.controller.js';
import { CatPhangService } from './cat-phang.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule, TypeOrmModule.forFeature([CatPhang])],
  controllers: [CatPhangController],
  providers: [CatPhangService],
})
export class CatPhangModule {}