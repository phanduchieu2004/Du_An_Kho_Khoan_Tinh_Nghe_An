import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { VaiTro } from './thuc-the/vai-tro.entity.js';
import { VaiTroController } from './vai-tro.controller.js';
import { VaiTroService } from './vai-tro.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([VaiTro])],
  controllers: [VaiTroController],
  providers: [VaiTroService],
})
export class VaiTroModule {}