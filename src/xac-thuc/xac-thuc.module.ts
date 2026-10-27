import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NguoiDungModule } from '../phan-he/nguoi-dung/nguoi-dung.module.js';
import { AuthController } from './xac-thuc.controller.js';
import { AuthGuard } from './bao-ve-xac-thuc.guard.js';
import { AuthSessionService } from './phien-xac-thuc.service.js';
import { UyQuyenModule } from '../phan-he/uy-quyen/uy-quyen.module.js';

@Module({
  imports: [NguoiDungModule, UyQuyenModule],
  controllers: [AuthController],
  providers: [
    AuthSessionService,
    AuthGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthGuard,
    },
  ],
  exports: [AuthSessionService],
})
export class AuthModule {}
