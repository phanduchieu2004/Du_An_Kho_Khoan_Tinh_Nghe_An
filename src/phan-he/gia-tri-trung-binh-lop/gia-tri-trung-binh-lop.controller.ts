import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { GiaTriTrungBinhLopService } from './gia-tri-trung-binh-lop.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

@Controller('gia-tri-trung-binh-lop')
export class GiaTriTrungBinhLopController {
  constructor(
    private readonly service: GiaTriTrungBinhLopService,
    private readonly users: NguoiDungService,
  ) {}

  @Get()
  @Render('gia_tri_trung_binh_lop')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(allowedProjectIds);

    return {
      title: 'Giá trị trung bình lớp đất',
      columns: ['id', 'lop_dat_id', 'suc_chiu_tai_ro', 'he_so_nen_lun_a', 'ghi_chu'],
      data,
    };
  }
}