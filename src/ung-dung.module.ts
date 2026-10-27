import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { db } from './cau-hinh/co-so-du-lieu.config.js';
import { getProjectRoot } from './tien-ich/duong-dan-ung-dung.js';
import { AppController } from './ung-dung.controller.js';
import { AppService } from './ung-dung.service.js';
import { CatPhangModule } from './phan-he/cat-phang/cat-phang.module.js';
import { CongTrinhModule } from './phan-he/cong-trinh/cong-trinh.module.js';
import { GiaTriTrungBinhLopModule } from './phan-he/gia-tri-trung-binh-lop/gia-tri-trung-binh-lop.module.js';
import { HoKhoanModule } from './phan-he/ho-khoan/ho-khoan.module.js';
import { LopDatModule } from './phan-he/lop-dat/lop-dat.module.js';
import { MauThiNghiemModule } from './phan-he/mau-thi-nghiem/mau-thi-nghiem.module.js';
import { NguoiDungModule } from './phan-he/nguoi-dung/nguoi-dung.module.js';
import { ThanhPhanHatModule } from './phan-he/thanh-phan-hat/thanh-phan-hat.module.js';
import { VaiTroModule } from './phan-he/vai-tro/vai-tro.module.js';
import { UploadModule } from './tai-len/tai-len.module.js';
import { MatBangModule } from './phan-he/mat-bang/mat-bang.module.js';
import { RecordActionsModule } from './phan-he/thao-tac-ban-ghi/thao-tac-ban-ghi.module.js';
import { DataExportModule } from './phan-he/xuat-du-lieu/xuat-du-lieu.module.js';
import { AuthModule } from './xac-thuc/xac-thuc.module.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PortalViewContextInterceptor } from './xac-thuc/ngu-canh-giao-dien-cong.interceptor.js';
import { UyQuyenModule } from './phan-he/uy-quyen/uy-quyen.module.js';
import { HoTroModule } from './phan-he/ho-tro/ho-tro.module.js';
@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(getProjectRoot(import.meta.url), 'public'),
    }),
    CatPhangModule,
    CongTrinhModule,
    GiaTriTrungBinhLopModule,
    HoKhoanModule,
    LopDatModule,
    MauThiNghiemModule,
    MatBangModule,
    RecordActionsModule,
    DataExportModule,
    AuthModule,
    UyQuyenModule,

    NguoiDungModule,
    HoTroModule,
    ThanhPhanHatModule,
    VaiTroModule,
    TypeOrmModule.forRoot(db),
    UploadModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PortalViewContextInterceptor,
    },
  ],
})
export class AppModule {}