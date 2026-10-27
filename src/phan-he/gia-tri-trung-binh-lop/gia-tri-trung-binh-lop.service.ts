import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GiaTriTrungBinhLop } from './thuc-the/gia-tri-trung-binh-lop.entity.js';

@Injectable()
export class GiaTriTrungBinhLopService {
  constructor(
    @InjectRepository(GiaTriTrungBinhLop)
    private readonly repository: Repository<GiaTriTrungBinhLop>,
  ) {}

  findAll(allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    if (!allowedProjectIds) return this.repository.find();
    return this.repository.createQueryBuilder('result')
      .where(
        `result.lop_dat_id IN (
           SELECT id FROM lop_dat WHERE cong_trinh_id IN (:...allowedProjectIds)
         )`,
        { allowedProjectIds },
      )
      .getMany();
  }
}