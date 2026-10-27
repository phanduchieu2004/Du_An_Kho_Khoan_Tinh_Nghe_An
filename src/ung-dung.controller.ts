import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthSessionService } from './xac-thuc/phien-xac-thuc.service.js';
import { Public } from './xac-thuc/cong-khai.decorator.js';
import { NguoiDungService } from './phan-he/nguoi-dung/nguoi-dung.service.js';
import { UyQuyenService } from './phan-he/uy-quyen/uy-quyen.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly sessions: AuthSessionService,
    private readonly users: NguoiDungService,
    private readonly permissions: UyQuyenService,
  ) {}

  @Public()
  @Get()
  @Render('index')
  async home(@Req() request: Request) {
    const sessionCookie = request.headers.cookie
      ?.split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith('hk_session='));
    const session = this.sessions.verify(
      sessionCookie?.slice('hk_session='.length),
    );
    const account = session
      ? await this.users.findProfileByUsername(session.username)
      : null;
    const hasMapAccess = Boolean(
      account?.duoc_dang_nhap &&
      session &&
      account.cong_vai_tro.includes(session.role),
    );
    const currentUser = hasMapAccess && account && session
      ? {
          ...session,
          fullName: account.ho_ten || account.ten_dang_nhap,
          assignedArea:
            session.role === 'ky-su' ? account.khu_vuc_duoc_xem ?? '' : '',
          hasAvatar: Boolean(
            await this.users.findAvatarPath(account.ma_nguoi_dung),
          ),
        }
      : null;

    return {
      currentUser,
      enabledPermissionIds: account && hasMapAccess
        ? await this.permissions.getEnabledPermissionIdsForAccount(
            account.ma_nguoi_dung,
          )
        : await this.permissions.getEnabledPermissionIds(),
      pageButtons:
        account && hasMapAccess
          ? await this.permissions.getButtonsForAccountOnPage(
              account.ma_nguoi_dung,
              'ban-do',
            )
          : [],
    };
  }
}
