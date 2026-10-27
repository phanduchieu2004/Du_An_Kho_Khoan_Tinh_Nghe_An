import { Module } from '@nestjs/common';
import { MatBangController } from './mat-bang.controller.js';
import { MatBangService } from './mat-bang.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule],
  controllers: [MatBangController],
  providers: [MatBangService],
  exports: [MatBangService],
})
export class MatBangModule {}