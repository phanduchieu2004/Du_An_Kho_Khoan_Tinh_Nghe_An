import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { ThanhPhanHatService } from './thanh-phan-hat.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

@Controller('thanh-phan-hat')
export class ThanhPhanHatController {
  constructor(
    private readonly service: ThanhPhanHatService,
    private readonly users: NguoiDungService,
  ) {}

  @Get()
  @Render('thanh_phan_hat')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(allowedProjectIds);

    return {
      title: 'Thành phần hạt',
      columns: [
        'id', 'mau_id', 'cuoi_dam_200_300', 'soi_150_200', 'soi_100_150',
        'hat_50_100', 'hat_20_50', 'hat_10_20', 'hat_5_10', 'hat_2_5',
        'hat_1_2', 'hat_05_1', 'hat_025_05', 'hat_008_025', 'hat_006_008',
        'hat_002_006', 'hat_0006_002', 'hat_0002_0006', 'hat_duoi_0002',
      ],
      data,
    };
  }
}