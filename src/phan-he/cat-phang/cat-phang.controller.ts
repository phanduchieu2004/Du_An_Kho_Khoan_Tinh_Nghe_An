import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { CatPhangService } from './cat-phang.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

@Controller('cat-phang')
export class CatPhangController {
  constructor(
    private readonly service: CatPhangService,
    private readonly users: NguoiDungService,
  ) {}

  @Get()
  @Render('cat_phang')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(allowedProjectIds);

    return {
      title: 'Kết quả thí nghiệm cắt phẳng',
      columns: [
        'id', 'mau_id', 'cap_ap_luc_025', 'cap_ap_luc_05', 'cap_ap_luc_1',
        'cap_ap_luc_2', 'cap_ap_luc_4', 'goc_noi_ma_sat_phi', 'luc_dinh_ket_c',
      ],
      data,
    };
  }
}