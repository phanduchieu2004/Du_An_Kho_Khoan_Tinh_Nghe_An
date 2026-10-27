import { Module } from '@nestjs/common';
import { UploadController } from './tai-len.controller.js';
import { UploadService } from './tai-len.service.js';

@Module({
  controllers: [UploadController],
  providers: [UploadService]
})
export class UploadModule {}
