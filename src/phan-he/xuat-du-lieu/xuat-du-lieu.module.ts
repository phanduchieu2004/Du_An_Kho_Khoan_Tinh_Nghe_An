import { Module } from '@nestjs/common';
import { DataExportController } from './xuat-du-lieu.controller.js';
import { DataExportService } from './xuat-du-lieu.service.js';

@Module({
  controllers: [DataExportController],
  providers: [DataExportService],
})
export class DataExportModule {}
