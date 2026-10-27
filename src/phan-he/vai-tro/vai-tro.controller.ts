import {
  Controller,
  Get,
  Render,
} from '@nestjs/common';

import { VaiTroService } from './vai-tro.service.js';

@Controller('vai-tro')
export class VaiTroController {
  constructor(private readonly service: VaiTroService) {}

  @Get()
  @Render('vai_tro')
  async index() {
    const data = await this.service.findAll();

    return {
      title: 'Danh sách vai trò',
      columns: ['ma_vai_tro', 'ten_vai_tro'],
      data,
    };
  }
}