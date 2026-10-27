import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Render,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

import { HoKhoanService } from './ho-khoan.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { AssignedAreaService } from '../nguoi-dung/khu-vuc-phan-cong.service.js';
import { getAllowedProjectIds } from '../nguoi-dung/ky-su-phan-cong.util.js';

interface ImportHoKhoanBody {
  cong_trinh_id?: string;
}

interface UploadedExcelFile {
  buffer: Buffer;
  originalname: string;
}

@Controller('ho-khoan')
export class HoKhoanController {
  constructor(
    private readonly service: HoKhoanService,
    private readonly users: NguoiDungService,
    private readonly assignedAreas: AssignedAreaService,
  ) {}

  @Get('api')
  async getHoKhoan(
    @Query('cong_trinh_id') congTrinhId: string | undefined,
    @Req() request: Request,
  ) {
    let projectId: number | undefined;
    if (congTrinhId !== undefined && congTrinhId !== '') {
      projectId = Number(congTrinhId);
      if (!Number.isInteger(projectId) || projectId <= 0) {
        throw new BadRequestException('cong_trinh_id phải là số nguyên dương');
      }
    }

    let holes;
    const username = request.authSession?.username;
    if (username && request.authSession?.role !== 'quan-tri-vien') {
      const account = await this.users.findAccountByUsername(username);
      const assignmentAccess = await this.users.findProjectAssignmentAccess(
        account.ma_nguoi_dung,
      );
      const assignedArea = (
        assignmentAccess.hasAssignments
          ? assignmentAccess.activeAreaName
          : account.khu_vuc_duoc_xem
      )?.trim();
      if (!assignedArea) {
        throw new ForbiddenException(
          'Tài khoản chưa được phân công khu vực để xem hố khoan.',
        );
      }
      const bounds = await this.assignedAreas.resolveBounds(
        assignedArea,
        assignmentAccess.hasAssignments
          ? assignmentAccess.activeGeometry
          : account.khu_vuc_phan_cong_ranh_gioi,
      );
      holes = await this.service.findAllWithinArea(
        bounds,
        projectId,
        assignmentAccess.hasAssignments
          ? assignmentAccess.activeProjectIds
          : undefined,
      );
    }
    if (!holes) {
      holes = await this.service.findAll(projectId);
    }

    const projects = await this.service.findProjects();
    const projectNames = new Map(
      projects.map((project) => [project.id, project.ten_cong_trinh]),
    );

    return holes.map((hole) =>
      Object.assign({}, hole, {
        ten_cong_trinh: projectNames.get(hole.cong_trinh_id) ?? null,
      }),
    );
  }

  @Get('them')
  @Render('them_ho_khoan')
  async createPage() {
    return {
      title: 'Nhập hố khoan từ Excel',
      projects: await this.service.findProjects(),
    };
  }

  @Post('them')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @Render('them_ho_khoan')
  async importFromExcel(
    @Body() body: ImportHoKhoanBody,
    @UploadedFile() file?: UploadedExcelFile,
  ) {
    const projects = await this.service.findProjects();

    try {
      if (!file) {
        throw new BadRequestException('Vui lòng chọn file Excel.');
      }
      if (!/\.(xls|xlsx)$/i.test(file.originalname)) {
        throw new BadRequestException(
          'Chỉ chấp nhận file có định dạng .xls hoặc .xlsx.',
        );
      }
      const projectId = Number(body.cong_trinh_id);
      const result = await this.service.importFromExcel(
        file.buffer,
        projectId,
      );

      return {
        title: 'Nhập hố khoan từ Excel',
        projects,
        result,
        fileName: file.originalname,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        return {
          title: 'Nhập hố khoan từ Excel',
          projects,
          error: error.message,
        };
      }

      throw error;
    }
  }

  @Get()
  @Render('hokhoan')
  async index(@Req() request: Request) {
    const allowedProjectIds = await getAllowedProjectIds(request, this.users);
    const data = await this.service.findAll(undefined, allowedProjectIds);

    return {
      title: 'Danh sách hố khoan',
      createUrl: '/ho-khoan/them',
      createLabel: 'Nhập hố khoan từ Excel',
      columns: [
        'id',
        'ma_ho_khoan',
        'cong_trinh_id',
        'x_vn2000',
        'y_vn2000',
        'latitude',
        'longitude',
      ],
      data,
    };
  }
}
