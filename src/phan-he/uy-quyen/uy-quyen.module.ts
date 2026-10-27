import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UyQuyenHeThong } from './thuc-the/uy-quyen-he-thong.entity.js';
import { UyQuyenTaiKhoan } from './thuc-the/uy-quyen-tai-khoan.entity.js';
import { UyQuyenService } from './uy-quyen.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UyQuyenHeThong, UyQuyenTaiKhoan])],
  providers: [UyQuyenService],
  exports: [UyQuyenService],
})
export class UyQuyenModule {}
