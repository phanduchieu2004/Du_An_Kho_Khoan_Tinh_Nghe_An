import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { LopDat } from './thuc-the/lop-dat.entity.js';

@Injectable()
export class LopDatService {
  constructor(
    @InjectRepository(LopDat)
    private readonly repository: Repository<LopDat>,
  ) {}

  findAll(allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    return this.repository.find(
      allowedProjectIds
        ? { where: { cong_trinh_id: In(allowedProjectIds) } }
        : undefined,
    );
  }
}