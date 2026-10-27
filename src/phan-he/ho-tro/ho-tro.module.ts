import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NguoiDung } from '../nguoi-dung/thuc-the/nguoi-dung.entity.js';
import { HoTroController } from './ho-tro.controller.js';
import { HoTroService } from './ho-tro.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([NguoiDung])],
  controllers: [HoTroController],
  providers: [HoTroService],
})
export class HoTroModule {}
