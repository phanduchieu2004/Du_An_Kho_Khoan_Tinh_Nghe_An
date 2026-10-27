import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MauThiNghiem } from './thuc-the/mau-thi-nghiem.entity.js';

@Injectable()
export class MauThiNghiemService {
  constructor(
    @InjectRepository(MauThiNghiem)
    private readonly repository: Repository<MauThiNghiem>,
  ) {}

  findAll(allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    if (!allowedProjectIds) return this.repository.find();
    return this.repository.createQueryBuilder('sample')
      .where(
        `sample.ho_khoan_id IN (
           SELECT id FROM ho_khoan WHERE cong_trinh_id IN (:...allowedProjectIds)
         )
         OR sample.lop_dat_id IN (
           SELECT id FROM lop_dat WHERE cong_trinh_id IN (:...allowedProjectIds)
         )`,
        { allowedProjectIds },
      )
      .getMany();
  }
}