import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { RecordActionsService } from './thao-tac-ban-ghi.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

interface RecordBody {
  [key: string]: string;
}

@Controller('records')
export class RecordActionsController {
  constructor(
    private readonly service: RecordActionsService,
    private readonly users: NguoiDungService,
  ) {}

  @Get(':table/:id/edit')
  @Render('sua_ban_ghi')
  async edit(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
  ) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    return this.service.getEditPage(table, id, allowedProjectIds);
  }

  @Post(':table/:id/edit')
  async update(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RecordBody,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    await this.service.update(table, id, body, allowedProjectIds);
    return response.redirect(this.listUrl(table));
  }

  @Post(':table/:id/delete')
  async delete(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    await this.service.delete(table, id, allowedProjectIds);
    return response.redirect(this.listUrl(table));
  }

  private listUrl(table: string): string {
    switch (table) {
      case 'ho_khoan': return '/ho-khoan';
      case 'lop_dat': return '/lop-dat';
      case 'mau_thi_nghiem': return '/mau-thi-nghiem';
      case 'thanh_phan_hat': return '/thanh-phan-hat';
      case 'cat_phang': return '/cat-phang';
      case 'gia_tri_trung_binh_lop': return '/gia-tri-trung-binh-lop';
      case 'nguoi_dung': return '/nguoi-dung';
      case 'vai_tro': return '/vai-tro';
      case 'cong_trinh_tai_lieu': return '/cong-trinh/danh-sach';
      case 'mat_bang': return '/mat-bang/danh-sach';
      default: return '/';
    }
  }
}
