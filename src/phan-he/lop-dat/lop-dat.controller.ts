import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { LopDatService } from './lop-dat.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

@Controller('lop-dat')
export class LopDatController {
  constructor(
    private readonly service: LopDatService,
    private readonly users: NguoiDungService,
  ) {}

  @Get()
  @Render('lop_dat')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(allowedProjectIds);

    return {
      title: 'Danh sách lớp đất',
      columns: ['id', 'cong_trinh_id', 'ten_lop', 'mo_ta'],
      data,
    };
  }
}