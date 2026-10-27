import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ThanhPhanHat } from './thuc-the/thanh-phan-hat.entity.js';

@Injectable()
export class ThanhPhanHatService {
  constructor(
    @InjectRepository(ThanhPhanHat)
    private readonly repository: Repository<ThanhPhanHat>,
  ) {}

  findAll(allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    if (!allowedProjectIds) return this.repository.find();
    return this.repository.createQueryBuilder('result')
      .where(
        `result.mau_id IN (
           SELECT s.id
           FROM mau_thi_nghiem s
           LEFT JOIN ho_khoan h ON h.id = s.ho_khoan_id
           LEFT JOIN lop_dat l ON l.id = s.lop_dat_id
           WHERE h.cong_trinh_id IN (:...allowedProjectIds)
              OR l.cong_trinh_id IN (:...allowedProjectIds)
         )`,
        { allowedProjectIds },
      )
      .getMany();
  }
}