import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOGIN_ROLES } from '../../xac-thuc/vai-tro-dang-nhap.js';
import {
  boundsFromAreaGeometry,
  isWithinAssignedArea,
  type AreaBounds,
} from './khu-vuc-phan-cong.util.js';
import {
  NguoiDungService,
  type AreaManagedAccountInput,
} from './nguoi-dung.service.js';

@Controller('quan-ly-khu-vuc')
export class QuanLyKhuVucController {
  constructor(private readonly users: NguoiDungService) {}

  @Get()
  @Render('quan_ly_khu_vuc')
  async index(@Req() request: Request) {
    const managerArea = await this.findManagerArea(request);
    const allAccounts = await this.users.findAll();
    const accounts = allAccounts.filter((account) =>
      this.isInManagerArea(account, managerArea),
    );
    return {
      title: 'Quản lý tài khoản trong khu vực',
      areaName: managerArea.name,
      accounts,
      roles: LOGIN_ROLES,
    };
  }

  @Get(':id')
  @Render('quan_ly_khu_vuc_chi_tiet')
  async accountDetails(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    const managerArea = await this.findManagerArea(request);
    const account = await this.users.findAccount(id);
    this.ensureAccountInManagerArea(account, managerArea);
    return {
      title: 'Cập nhật tài khoản trong khu vực',
      account,
      roles: LOGIN_ROLES,
    };
  }

  @Post(':id/cap-nhat')
  async updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const managerArea = await this.findManagerArea(request);
    const account = await this.users.findAccount(id);
    this.ensureAccountInManagerArea(account, managerArea);
    await this.users.updateAreaManagedAccount(
      id,
      this.parseInput(body),
      managerArea.bounds,
    );
    response.redirect('/quan-ly-khu-vuc');
  }

  @Post(':id/xoa')
  async deleteAccount(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const managerArea = await this.findManagerArea(request);
    const account = await this.users.findAccount(id);
    this.ensureAccountInManagerArea(account, managerArea);
    await this.users.deleteAreaManagedAccount(id, managerArea.bounds);
    response.redirect('/quan-ly-khu-vuc');
  }

  private async findManagerArea(
    request: Request,
  ): Promise<{ name: string; bounds: AreaBounds }> {
    const username = request.authSession?.username;
    if (!username) {
      throw new BadRequestException('Không tìm thấy phiên đăng nhập.');
    }
    const manager = await this.users.findAccountByUsername(username);
    if (!manager.cong_vai_tro.includes('quan-ly-khu-vuc')) {
      throw new BadRequestException(
        'Chức năng này chỉ dành cho tài khoản Quản lý khu vực.',
      );
    }
    const name = manager.khu_vuc_duoc_xem?.trim();
    const bounds = boundsFromAreaGeometry(
      manager.khu_vuc_phan_cong_ranh_gioi,
    );
    if (!name || !bounds) {
      throw new BadRequestException(
        'Tài khoản chưa được Admin giao ranh giới khu vực hợp lệ.',
      );
    }
    return { name, bounds };
  }

  private ensureAccountInManagerArea(
    account: Awaited<ReturnType<NguoiDungService['findAccount']>>,
    managerArea: { bounds: AreaBounds },
  ): void {
    if (!this.isInManagerArea(account, managerArea)) {
      throw new NotFoundException('Không tìm thấy tài khoản trong khu vực.');
    }
  }

  private isInManagerArea(
    account: Awaited<ReturnType<NguoiDungService['findAccount']>>,
    managerArea: { bounds: AreaBounds },
  ): boolean {
    const hasManagedRole = account.cong_vai_tro.some(
      (role) => role === 'ky-su' || role === 'nguoi-xem-ban-do',
    );
    if (
      !hasManagedRole ||
      account.cong_vai_tro.includes('quan-tri-vien') ||
      account.cong_vai_tro.includes('quan-ly-khu-vuc')
    ) {
      return false;
    }
    return isWithinAssignedArea(
      managerArea.bounds,
      account.khu_vuc_phan_cong_vi_do,
      account.khu_vuc_phan_cong_kinh_do,
    );
  }

  private parseInput(body: Record<string, unknown>): AreaManagedAccountInput {
    const text = (key: string, maxLength: number): string | null => {
      const value = body[key];
      if (value === undefined || value === null || value === '') return null;
      if (typeof value !== 'string' || value.trim().length > maxLength) {
        throw new BadRequestException(`Trường ${key} không hợp lệ.`);
      }
      return value.trim() || null;
    };
    const hoTen = text('ho_ten', 255);
    if (!hoTen) {
      throw new BadRequestException('Vui lòng nhập họ tên.');
    }
    const status = text('trang_thai', 20) ?? '';
    const password =
      typeof body.mat_khau === 'string' ? body.mat_khau : '';
    return {
      ho_ten: hoTen,
      email: text('email', 255),
      dia_chi: text('dia_chi', Number.MAX_SAFE_INTEGER),
      so_dien_thoai: text('so_dien_thoai', 20),
      ma_ky_su: text('ma_ky_su', 50),
      chuyen_nganh: text('chuyen_nganh', 100),
      don_vi_cong_tac: text('don_vi_cong_tac', 255),
      so_chung_chi_hanh_nghe: text('so_chung_chi_hanh_nghe', 100),
      trang_thai: status,
      duoc_dang_nhap: body.duoc_dang_nhap === 'true',
      mat_khau: password || undefined,
    };
  }
}
