import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  StreamableFile,
} from '@nestjs/common';
import {
  DataExportService,
} from './xuat-du-lieu.service.js';
import type { CurrentPageExport } from './xuat-du-lieu.service.js';

@Controller('xuat-file')
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get('tong-hop')
  async exportSummary(): Promise<StreamableFile> {
    const file = await this.dataExportService.exportWorkbook();

    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="tong-hop-du-lieu.xlsx"',
    });
  }

  @Post('trang-hien-tai')
  @HttpCode(HttpStatus.OK)
  exportCurrentPage(
    @Body() request: CurrentPageExport,
  ): StreamableFile {
    const file = this.dataExportService.exportCurrentPage(request);

    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="du-lieu-trang-hien-tai.xlsx"',
    });
  }
}
