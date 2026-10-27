import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HoKhoanModule } from '../ho-khoan/ho-khoan.module.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';
import { MatBangModule } from '../mat-bang/mat-bang.module.js';

import { CongTrinh } from './thuc-the/cong-trinh.entity.js';
import { CongTrinhTaiLieu } from './thuc-the/cong-trinh-tai-lieu.entity.js';
import { CongTrinhController } from './cong-trinh.controller.js';
import { CongTrinhService } from './cong-trinh.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CongTrinh, CongTrinhTaiLieu]),
    HoKhoanModule,
    NguoiDungModule,
    MatBangModule,
  ],
  controllers: [
    CongTrinhController
  ],
  providers: [
    CongTrinhService
  ]
})
export class CongTrinhModule {}