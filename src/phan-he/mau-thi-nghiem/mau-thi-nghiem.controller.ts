import {
  Controller,
  Get,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { MauThiNghiemService } from './mau-thi-nghiem.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

@Controller('mau-thi-nghiem')
export class MauThiNghiemController {
  constructor(
    private readonly service: MauThiNghiemService,
    private readonly users: NguoiDungService,
  ) {}

  @Get()
  @Render('mau_thi_nghiem')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(allowedProjectIds);

    return {
      title: 'Danh sách mẫu thí nghiệm',
      columns: [
        'id', 'ho_khoan_id', 'lop_dat_id', 'stt', 'so_hieu_mau',
        'do_sau_tu', 'do_sau_den', 'so_thi_nghiem', 'do_am_tu_nhien_w',
        'khoi_luong_the_tich_tu_nhien_g', 'khoi_luong_the_tich_kho_gc',
        'khoi_luong_the_tich_kho_max', 'khoi_luong_the_tich_kho_min',
        'gioi_han_chay_wl', 'gioi_han_deo_wp', 'chi_so_deo_ip', 'chi_so_do_set_b',
        'khoi_luong_rieng_d', 'he_so_rong_e0', 'he_so_rong_emax', 'he_so_rong_emin',
        'do_rong_n', 'do_bao_hoa_g', 'he_so_nen_lun_a', 'mo_dun_bien_dang_e12',
        'goc_noi_ma_sat_phi', 'luc_dinh_ket_c', 'goc_nghi_kho_ak', 'goc_nghi_uot_aw',
        'cuong_do_khang_nen_kho_rk', 'cuong_do_khang_nen_bao_hoa_rbh',
        'he_so_hoa_mem_f', 'suc_chiu_tai_ro', 'phan_loai_dat_da',
      ],
      data,
    };
  }
}