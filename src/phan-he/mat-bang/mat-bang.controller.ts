import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  BadRequestException,
  NotFoundException,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { MatBangService } from './mat-bang.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { AssignedAreaService } from '../nguoi-dung/khu-vuc-phan-cong.service.js';
import type { AreaBounds } from '../nguoi-dung/khu-vuc-phan-cong.util.js';

@Controller('mat-bang')
export class MatBangController {
  constructor(
    private readonly matBangService: MatBangService,
    private readonly users: NguoiDungService,
    private readonly assignedAreas: AssignedAreaService,
  ) {}

  @Get('danh-sach')
  @Render('danh_sach')
  async list() {
    return {
      title: 'Danh sách mặt bằng',
      columns: [
        'id',
        'cong_trinh_id',
        'ten_mat_bang',
        'loai_mat_bang',
        'cap_mat_bang',
        'ranh_gioi',
        'ma_he_toa_do_nguon',
        'trang_thai',
      ],
      data: await this.matBangService.findAllRows(),
    };
  }

  @Get('api')
  async getGeoJson(
    @Query('cong_trinh_id') congTrinhId?: string,
    @Req() request?: Request,
  ) {
    let id: number | undefined;
    if (congTrinhId !== undefined && congTrinhId !== '') {
      id = Number(congTrinhId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestException('cong_trinh_id phải là số nguyên dương');
      }
    }

    const area = await this.getAssignedArea(request);
    return this.matBangService.findAll(
      id,
      area?.projectIds,
      area?.bounds.geometry,
    );
  }

  @Get('api/cap-2')
  async getLevelTwoAreas(
    @Query('parent_id') parentId?: string,
    @Req() request?: Request,
  ) {
    const id = Number(parentId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('parent_id phải là số nguyên dương');
    }
    const area = await this.getAssignedArea(request);
    if (area) {
      const authorizedAreas = await this.matBangService.findAll(
        undefined,
        area.projectIds,
        area.bounds.geometry,
      );
      if (
        !authorizedAreas.features.some(
          (feature: { properties: { id: number } }) =>
            Number(feature.properties.id) === id,
        )
      ) {
        throw new NotFoundException(
          'Không tìm thấy mặt bằng trong khu vực được giao.',
        );
      }
    }

    return this.matBangService.findLevelTwoWithin(
      id,
      area?.projectIds,
      area?.bounds.geometry,
    );
  }

  private async getAssignedArea(
    request?: Request,
  ): Promise<{ projectIds: number[]; bounds: AreaBounds } | undefined> {
    const session = request?.authSession;
    if (!session || session.role === 'quan-tri-vien') {
      return undefined;
    }

    const account = await this.users.findAccountByUsername(session.username);
    const assignedArea = account.khu_vuc_duoc_xem?.trim();
    if (!assignedArea) {
      throw new ForbiddenException(
        'Tài khoản chưa được phân công khu vực để xem mặt bằng.',
      );
    }

    const assignmentAccess = await this.users.findProjectAssignmentAccess(
      account.ma_nguoi_dung,
    );
    const assignedGeometry = assignmentAccess.hasAssignments
      ? assignmentAccess.activeGeometry
      : account.khu_vuc_phan_cong_ranh_gioi;
    if (assignmentAccess.hasAssignments && !assignedGeometry) {
      return {
        projectIds: [],
        bounds: await this.assignedAreas.resolveBounds(assignedArea, null),
      };
    }
    const bounds = await this.assignedAreas.resolveBounds(
      assignedArea,
      assignedGeometry,
    );
    const projectIds = assignmentAccess.hasAssignments
      ? assignmentAccess.activeProjectIds
      : await this.matBangService.findProjectIdsInBounds(bounds);
    return { projectIds, bounds };
  }
}
