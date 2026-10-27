import { Module } from '@nestjs/common';

import { RecordActionsController } from './thao-tac-ban-ghi.controller.js';
import { RecordActionsService } from './thao-tac-ban-ghi.service.js';
import { NguoiDungModule } from '../nguoi-dung/nguoi-dung.module.js';

@Module({
  imports: [NguoiDungModule],
  controllers: [RecordActionsController],
  providers: [RecordActionsService],
})
export class RecordActionsModule {}
