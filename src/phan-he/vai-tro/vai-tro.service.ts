import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { VaiTro } from './thuc-the/vai-tro.entity.js';

@Injectable()
export class VaiTroService {
  constructor(
    @InjectRepository(VaiTro)
    private readonly repository: Repository<VaiTro>,
  ) {}

  findAll() {
    return this.repository.find();
  }
}