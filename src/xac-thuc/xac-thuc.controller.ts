import {
  Body,
  Controller,
  Get,
  ConflictException,
  NotFoundException,
  Param,
  Post,
  Render,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { NguoiDungService } from '../phan-he/nguoi-dung/nguoi-dung.service.js';
import { AuthSessionService } from './phien-xac-thuc.service.js';
import { LOGIN_ROLES } from './vai-tro-dang-nhap.js';
import { Public } from './cong-khai.decorator.js';

const SESSION_COOKIE = 'hk_session';

@Controller()
export class AuthController {
  constructor(
    private readonly users: NguoiDungService,
    private readonly sessions: AuthSessionService,
  ) {}

  @Public()
  @Get('dang-nhap')
  @Render('dang_nhap')
  loginPortals() {
    return { roles: LOGIN_ROLES };
  }

  @Public()
  @Get('dang-nhap/:slug')
  @Render('dang_nhap_chi_tiet')
  loginPage(@Param('slug') slug: string) {
    const role = LOGIN_ROLES.find((item) => item.slug === slug);
    if (!role) {
      throw new NotFoundException('Không tìm thấy cổng đăng nhập.');
    }
    return { role, error: null, username: '' };
  }

  @Public()
  @Get('dang-ky/:slug')
  @Render('dang_ky')
  registerPage(@Param('slug') slug: string) {
    const role = this.getRegistrationRole(slug);
    return {
      role,
      error: null,
      username: '',
      fullName: '',
      profile: {},
    };
  }

  @Public()
  @Post('dang-ky/:slug')
  async register(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const role = this.getRegistrationRole(slug);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const isEngineer = role.slug === 'ky-su';
    const profile = {
      email: typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null,
      dia_chi: typeof body.dia_chi === 'string' && body.dia_chi.trim() ? body.dia_chi.trim() : null,
      so_dien_thoai: typeof body.so_dien_thoai === 'string' && body.so_dien_thoai.trim()
        ? body.so_dien_thoai.trim()
        : null,
      ma_ky_su: isEngineer && typeof body.ma_ky_su === 'string' && body.ma_ky_su.trim()
        ? body.ma_ky_su.trim()
        : null,
      chuyen_nganh: isEngineer && typeof body.chuyen_nganh === 'string' && body.chuyen_nganh.trim()
        ? body.chuyen_nganh.trim()
        : null,
      don_vi_cong_tac: isEngineer && typeof body.don_vi_cong_tac === 'string' && body.don_vi_cong_tac.trim()
        ? body.don_vi_cong_tac.trim()
        : null,
      so_chung_chi_hanh_nghe: isEngineer && typeof body.so_chung_chi_hanh_nghe === 'string' &&
        body.so_chung_chi_hanh_nghe.trim()
        ? body.so_chung_chi_hanh_nghe.trim()
        : null,
    };
    const password = typeof body.password === 'string' ? body.password : '';
    const passwordConfirmation =
      typeof body.passwordConfirmation === 'string'
        ? body.passwordConfirmation
        : '';

    if (password !== passwordConfirmation) {
      response.status(400).render('dang_ky', {
        role,
        error: 'Mật khẩu xác nhận không khớp.',
        username,
        fullName,
        profile,
      });
      return;
    }

    try {
      await this.users.registerAccount(
        username,
        fullName,
        password,
        role.slug,
        profile,
      );
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }
      response.status(409).render('dang_ky', {
        role,
        error: error.message,
        username,
        fullName,
        profile,
      });
      return;
    }

    response.cookie(
      SESSION_COOKIE,
      this.sessions.create(username, role.slug),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
      },
    );
    response.redirect('/');
  }

  @Public()
  @Post('dang-nhap/:slug')
  async login(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const role = LOGIN_ROLES.find((item) => item.slug === slug);
    if (!role) {
      throw new NotFoundException('Không tìm thấy cổng đăng nhập.');
    }

    const username = body.username;
    const password = body.password;
    const validInput =
      typeof username === 'string' &&
      username.length <= 100 &&
      typeof password === 'string' &&
      password.length <= 255;
    const authenticated =
      validInput &&
      (await this.users.verifyCredentials(username, password, role.slug));

    if (!authenticated) {
      response
        .status(401)
        .set('Cache-Control', 'no-store')
        .render('dang_nhap_chi_tiet', {
          role,
          error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
          username: typeof username === 'string' ? username : '',
        });
      return;
    }

    response.cookie(
      SESSION_COOKIE,
      this.sessions.create(username, role.slug),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 8 * 60 * 60 * 1000,
        path: '/',
      },
    );
    response.redirect(
      role.slug === 'quan-ly-khu-vuc' ? '/quan-ly-khu-vuc' : '/',
    );
  }

  @Public()
  @Post('dang-xuat')
  logout(@Res() response: Response): void {
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.redirect('/dang-nhap');
  }

  private getRegistrationRole(slug: string) {
    const role = LOGIN_ROLES.find((item) => item.slug === slug);
    if (
      !role ||
      role.slug === 'quan-tri-vien' ||
      role.slug === 'quan-ly-khu-vuc'
    ) {
      throw new NotFoundException('Cổng này không hỗ trợ đăng ký tài khoản.');
    }
    return role;
  }
}
