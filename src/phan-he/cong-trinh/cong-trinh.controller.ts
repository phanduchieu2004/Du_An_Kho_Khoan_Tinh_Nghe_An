import {
  BadRequestException,
  ForbiddenException,
  Controller,
  NotFoundException,
  Get,
  Post,
  Body,
  Render,
  Req,
  Res,
  Query,
  Param,
  ParseIntPipe,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';

import type { Request, Response } from 'express';

import { CongTrinhService } from './cong-trinh.service.js';
import type {
  ProjectDetailTableKey,
  ProjectSurveyInput,
  ProjectSurveyUpdateInput,
  UploadedProjectFile,
} from './cong-trinh.service.js';
import { HoKhoanService } from '../ho-khoan/ho-khoan.service.js';
import { NguoiDungService } from '../nguoi-dung/nguoi-dung.service.js';
import { AssignedAreaService } from '../nguoi-dung/khu-vuc-phan-cong.service.js';
import { MatBangService } from '../mat-bang/mat-bang.service.js';
import { isValidAssignmentDate } from '../../xac-thuc/thoi-han-phan-cong.util.js';
import {
  boundsFromAreaGeometry,
  isWithinAssignedArea,
  type AreaGeometry,
} from '../nguoi-dung/khu-vuc-phan-cong.util.js';

interface UploadedExcelFile {
  buffer: Buffer;
  originalname: string;
}

interface ProjectUploadFields {
  files?: UploadedProjectFile[];
  hoKhoanExcel?: UploadedExcelFile[];
}

interface CreateProjectBody {
  ten_cong_trinh?: string;
  dia_diem?: string;
  hang_muc?: string;
  ghi_chu?: string;
  documentType?: string;
  ten_mat_bang: string;
  loai_mat_bang: string;
  cap_mat_bang?: string;
  ranh_gioi: string;
  ma_he_toa_do_nguon: string;
}

@Controller('cong-trinh')
export class CongTrinhController {
  constructor(
    private readonly service: CongTrinhService,
    private readonly hoKhoanService: HoKhoanService,
    private readonly users: NguoiDungService,
    private readonly assignedAreas: AssignedAreaService,
    private readonly matBangService: MatBangService,
  ) {}

  // Danh sách ngắn
  @Get()
  @Render('cong_trinh')
  async index(@Req() request: Request) {
    const data = await this.service.findAll(
      await this.getAssignedProjectIds(request),
    );

    return {
      title: 'Danh sách công trình',

      createUrl: '/cong-trinh/them',

      columns: ['id', 'ten_cong_trinh', 'dia_diem', 'hang_muc'],

      data,
      currentUser: request.authSession ?? null,
    };
  }

  @Get('phan-bo')
  @Render('phan_bo_cong_trinh')
  async allocationPage(@Req() request: Request) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được mở trang phân bổ công trình.',
      );
    }
    const projects = await this.service.findAll();
    const allocationStatuses = await this.users.findProjectAllocationStatuses();
    const allocationByProjectId = new Map(
      allocationStatuses.map((allocation) => [
        Number(allocation.cong_trinh_id),
        allocation,
      ]),
    );
    const projectsWithAllocation = projects.map((project) => ({
      project,
      allocation: allocationByProjectId.get(Number(project.id)) ?? null,
    }));
    const projectTabs = [
      {
        id: 'unassigned',
        label: 'Chưa phân công',
        projects: projectsWithAllocation.filter(({ allocation }) => !allocation),
      },
      {
        id: 'assigned',
        label: 'Đã có người đảm nhiệm',
        projects: projectsWithAllocation.filter(
          ({ allocation }) => allocation?.allocation_status === 'assigned',
        ),
      },
      {
        id: 'overdue',
        label: 'Đã quá hạn',
        projects: projectsWithAllocation.filter(
          ({ allocation }) => allocation?.allocation_status === 'overdue',
        ),
      },
      {
        id: 'pending-cancellation',
        label: 'Đang treo đơn hủy',
        projects: projectsWithAllocation.filter(
          ({ allocation }) =>
            allocation?.allocation_status === 'pending_cancellation',
        ),
      },
    ];
    return {
      title: 'Phân bổ công trình',
      projects,
      projectTabs,
      engineers: await this.users.findEngineerAllocationSummaries(),
      currentUser: request.authSession,
    };
  }

  // Danh sách đầy đủ
  @Get('danh-sach')
  @Render('danh_sach_cong_trinh')
  async danhSach(@Req() request: Request) {
    const allowedProjectIds = await this.getAssignedProjectIds(request);
    const data = await this.service.findProjectsWithLevelOneSurveyAreas(
      allowedProjectIds,
    );
    const engineerSession =
      request.authSession?.role === 'ky-su' ? request.authSession : null;
    let pendingCancellationRequests: Array<Record<string, unknown>> = [];
    if (engineerSession) {
      const account = await this.users.findAccountByUsername(
        engineerSession.username,
      );
      pendingCancellationRequests =
        await this.users.findMyPendingEngineerCancellationRequests(
          account.ma_nguoi_dung,
        );
      const assignments = await this.users.findEngineerProjectAssignments(
        account.ma_nguoi_dung,
      );
      const assignmentStatusByProjectId = new Map<number, string>();
      for (const assignment of assignments) {
        const projectId = Number(assignment.cong_trinh_id);
        if (assignmentStatusByProjectId.has(projectId)) continue;
        assignmentStatusByProjectId.set(
          projectId,
          assignment.cancellation_status === 'da_duyet'
            ? 'Chưa phân công'
            : assignment.da_hoan_thanh
              ? 'Đã hoàn thành'
              : assignment.dang_hieu_luc
                ? 'Đang thực hiện'
                : 'Đã kết thúc',
        );
      }
      for (const project of data) {
        Object.assign(project, {
          trang_thai_phan_cong:
            assignmentStatusByProjectId.get(project.id) ?? 'Chưa phân công',
        });
      }
    }

    return {
      title: 'Danh sách công trình',

      createUrl: '/cong-trinh/them',

      createLabel: '+ Thêm công trình',

      columns: [
        'id',
        'ten_cong_trinh',
        'dia_diem',
        'hang_muc',
        'ghi_chu',
        'ngay_tao',
        'ngay_cap_nhat',
        ...(engineerSession ? ['trang_thai_phan_cong'] : []),
      ],

      data,
      pendingCancellationRequests,
      createdPendingApproval: request.query.created === 'pending',
      currentUser: request.authSession ?? null,
    };
  }

  @Get('da-tao')
  @Render('cong_trinh_da_tao')
  async createdProjects(@Req() request: Request) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException(
        'Mục công trình đã tạo chỉ dành cho Kỹ sư.',
      );
    }
    const account = await this.users.findAccountByUsername(
      request.authSession.username,
    );
    return {
      title: 'Công trình đã tạo',
      projects: await this.service.findCreatedBy(account.ma_nguoi_dung),
      createdPendingApproval: request.query.created === 'pending',
      currentUser: request.authSession,
    };
  }

  @Get('lich-su-phan-cong')
  @Render('lich_su_phan_cong_ky_su')
  async engineerAssignmentHistory(@Req() request: Request) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException('Lịch sử phân công chỉ dành cho Kỹ sư.');
    }
    const account = await this.users.findAccountByUsername(
      request.authSession.username,
    );
    const assignments = await this.users.findEngineerAssignmentHistory(
      account.ma_nguoi_dung,
    );
    return {
      title: 'Lịch sử công trình được phân công',
      completed: assignments.filter(
        (assignment) => assignment.history_status === 'completed',
      ),
      inProgress: assignments.filter(
        (assignment) => assignment.history_status === 'in_progress',
      ),
      unfinished: assignments.filter(
        (assignment) => assignment.history_status === 'unfinished',
      ),
      renewalSubmitted: request.query.renewal === 'submitted',
      currentUser: request.authSession,
    };
  }

  @Post('yeu-cau-gia-han')
  async submitEngineerAssignmentRenewal(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException(
        'Chỉ Kỹ sư mới được gửi yêu cầu gia hạn phân công.',
      );
    }
    const assignmentId = Number(body.assignmentId);
    const newEndDate =
      typeof body.newEndDate === 'string' ? body.newEndDate : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (
      !Number.isInteger(assignmentId) ||
      assignmentId <= 0 ||
      !isValidAssignmentDate(newEndDate) ||
      reason.length < 5 ||
      reason.length > 2000
    ) {
      throw new BadRequestException(
        'Chọn phân công, ngày kết thúc mới hợp lệ và nhập lý do từ 5 đến 2000 ký tự.',
      );
    }
    const account = await this.users.findAccountByUsername(
      request.authSession.username,
    );
    await this.users.submitEngineerAssignmentRenewalRequest(
      account.ma_nguoi_dung,
      assignmentId,
      newEndDate,
      reason,
    );
    return response.redirect('/cong-trinh/lich-su-phan-cong?renewal=submitted');
  }

  @Get('gia-han-cho-duyet')
  @Render('duyet_gia_han_phan_cong')
  async pendingEngineerAssignmentRenewals(
    @Req() request: Request,
    @Query('approved') approved: string | undefined,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt gia hạn phân công.',
      );
    }
    return {
      title: 'Yêu cầu gia hạn phân công chờ duyệt',
      requests: await this.users.findPendingEngineerAssignmentRenewalRequests(),
      renewalApproved: approved === '1',
      currentUser: request.authSession,
    };
  }

  @Post('gia-han-cho-duyet/:requestId/duyet')
  async approveEngineerAssignmentRenewal(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt gia hạn phân công.',
      );
    }
    await this.users.approveEngineerAssignmentRenewalRequest(requestId);
    return response.redirect('/cong-trinh/gia-han-cho-duyet?approved=1');
  }

  @Get('yeu-cau-huy')
  @Render('yeu_cau_huy_phan_cong')
  async engineerCancellationPage(@Req() request: Request) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException('Gửi đơn hủy phân công chỉ dành cho Kỹ sư.');
    }
    const account = await this.users.findAccountByUsername(
      request.authSession.username,
    );
    return {
      title: 'Gửi đơn hủy phân công',
      assignments: await this.users.findCancelableEngineerAssignments(
        account.ma_nguoi_dung,
      ),
      requests: await this.users.findEngineerCancellationRequests(
        account.ma_nguoi_dung,
      ),
      submitted: request.query.submitted === '1',
      currentUser: request.authSession,
    };
  }

  @Post('yeu-cau-huy')
  async submitEngineerCancellation(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'ky-su') {
      throw new ForbiddenException('Gửi đơn hủy phân công chỉ dành cho Kỹ sư.');
    }
    const assignmentId = Number(body.assignmentId);
    const reason =
      typeof body.reason === 'string' ? body.reason.trim() : '';
    if (
      !Number.isInteger(assignmentId) ||
      assignmentId <= 0 ||
      reason.length < 5 ||
      reason.length > 2000
    ) {
      throw new BadRequestException(
        'Chọn phân công và nhập lý do hủy từ 5 đến 2000 ký tự.',
      );
    }
    const account = await this.users.findAccountByUsername(
      request.authSession.username,
    );
    await this.users.submitEngineerCancellationRequest(
      account.ma_nguoi_dung,
      assignmentId,
      reason,
    );
    return response.redirect('/cong-trinh/yeu-cau-huy?submitted=1');
  }

  @Get('yeu-cau-huy/quan-tri')
  @Render('duyet_yeu_cau_huy_phan_cong')
  async pendingEngineerCancellations(
    @Req() request: Request,
    @Query('approved') approved: string | undefined,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt đơn hủy phân công.',
      );
    }
    return {
      title: 'Đơn hủy phân công chờ duyệt',
      requests: await this.users.findPendingEngineerCancellationRequests(),
      cancellationApproved: approved === '1',
      currentUser: request.authSession,
    };
  }

  @Post('yeu-cau-huy/:requestId/duyet')
  async approveEngineerCancellation(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt đơn hủy phân công.',
      );
    }
    await this.users.approveEngineerCancellationRequest(requestId);
    return response.redirect('/cong-trinh/yeu-cau-huy/quan-tri?approved=1');
  }

  @Get('cho-duyet')
  @Render('duyet_cong_trinh')
  async pendingProjectApprovals(
    @Req() request: Request,
    @Query('tab') selectedTab: string | undefined,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt công trình.',
      );
    }
    const activeTab = ['cap-2', 'cap-3', 'cap-4'].includes(selectedTab ?? '')
      ? selectedTab!
      : 'cong-trinh';
    const [projects, surveyRequests] = await Promise.all([
      this.service.findPendingApproval(),
      this.service.findPendingSurveyRequests(),
    ]);
    const surveyCount = (level: number) =>
      surveyRequests.filter((survey) => survey.cap_mat_bang === level).length;
    return {
      title: 'Duyệt công trình và mặt bằng',
      activeTab,
      projects,
      surveyRequests: surveyRequests.filter(
        (survey) => survey.cap_mat_bang === Number(activeTab.replace('cap-', '')),
      ),
      tabCounts: {
        projects: projects.length,
        levelTwo: surveyCount(2),
        levelThree: surveyCount(3),
        levelFour: surveyCount(4),
      },
      currentUser: request.authSession,
    };
  }

  @Get('mat-bang-cap-2-cho-duyet')
  legacyPendingLevelTwoApprovals(@Res() response: Response) {
    return response.redirect('/cong-trinh/cho-duyet?tab=cap-2');
  }

  @Post('mat-bang-cap-cho-duyet/:level/:requestId/duyet')
  async approveLevelSurvey(
    @Param('level') levelParam: string,
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt mặt bằng cấp 2, 3 hoặc 4.',
      );
    }
    const level = Number(levelParam);
    if (!Number.isInteger(level) || level < 2 || level > 4) {
      throw new BadRequestException('Cấp mặt bằng chờ duyệt không hợp lệ.');
    }
    await this.service.approveLevelSurveyRequest(
      requestId,
      level,
      request.authSession.username,
    );
    return response.redirect(`/cong-trinh/cho-duyet?tab=cap-${level}`);
  }

  @Post(':projectId/duyet')
  async approveProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt công trình.',
      );
    }
    await this.service.approveProject(projectId);
    return response.redirect('/cong-trinh/cho-duyet');
  }

  @Post('phan-bo')
  async allocateProjects(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được phân bổ công trình.',
      );
    }
    const assignments = body.assignments;
    const engineerId = body.engineerId;
    if (
      !Array.isArray(assignments) ||
      assignments.length === 0 ||
      assignments.length > 20 ||
      typeof engineerId !== 'number' ||
      !Number.isInteger(engineerId) ||
      engineerId <= 0
    ) {
      throw new BadRequestException(
        'Hãy chọn từ 1 đến 20 công trình kèm thời hạn và một kỹ sư hợp lệ.',
      );
    }

    const parsedAssignments = assignments.map((assignment) => {
      if (
        typeof assignment !== 'object' ||
        assignment === null ||
        !('projectId' in assignment) ||
        !('startDate' in assignment) ||
        !('endDate' in assignment)
      ) {
        throw new BadRequestException(
          'Thông tin thời hạn công trình không hợp lệ.',
        );
      }
      const { projectId, startDate, endDate } = assignment as {
        projectId: unknown;
        startDate: unknown;
        endDate: unknown;
      };
      if (
        typeof projectId !== 'number' ||
        !Number.isInteger(projectId) ||
        projectId <= 0 ||
        typeof startDate !== 'string' ||
        !isValidAssignmentDate(startDate) ||
        typeof endDate !== 'string' ||
        !isValidAssignmentDate(endDate) ||
        startDate > endDate
      ) {
        throw new BadRequestException(
          'Mỗi công trình cần có ngày bắt đầu và kết thúc hợp lệ.',
        );
      }
      return { projectId, startDate, endDate };
    });
    const selectedIds = parsedAssignments.map(({ projectId }) => projectId);
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new BadRequestException('Không được chọn trùng công trình.');
    }
    const resolved = Array.isArray(body.resolvedAreas)
      ? await this.resolveProjectAllocationFromClient(
          selectedIds,
          body.resolvedAreas,
        )
      : await this.resolveProjectAllocation(selectedIds);
    const engineer = await this.users.findAccount(engineerId);
    if (
      !engineer.duoc_dang_nhap ||
      !engineer.cong_vai_tro.includes('ky-su') ||
      engineer.cong_vai_tro.includes('quan-tri-vien') ||
      engineer.cong_vai_tro.includes('quan-ly-khu-vuc')
    ) {
      throw new BadRequestException(
        'Tài khoản được chọn không phải Kỹ sư hợp lệ.',
      );
    }
    const assignmentInputs = parsedAssignments.map((assignment) => {
      const projectArea = resolved.resolvedAreas.find(
        ({ project }) => project.id === assignment.projectId,
      )!;
      return {
        projectId: assignment.projectId,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
        areaName: projectArea.area.name,
        geometry: projectArea.area.bounds.geometry!,
        latitude: projectArea.point.latitude,
        longitude: projectArea.point.longitude,
      };
    });
    await this.users.assignEngineerAreaFromProjects(
      engineerId,
      resolved.areaNames.join('; '),
      resolved.geometry,
      resolved.resolvedAreas[0].point.latitude,
      resolved.resolvedAreas[0].point.longitude,
      assignmentInputs,
    );
    response.json({
      message: `Đã bổ nhiệm ${assignments.length} công trình cho kỹ sư trong ${resolved.areaNames.length} khu vực.`,
      areaNames: resolved.areaNames,
    });
  }

  @Post('phan-bo/xem-truoc')
  async previewProjectAllocation(
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được xem trước phân bổ.',
      );
    }
    const projectIds = body.projectIds;
    if (
      !Array.isArray(projectIds) ||
      projectIds.length === 0 ||
      projectIds.length > 20 ||
      projectIds.some(
        (id) => typeof id !== 'number' || !Number.isInteger(id) || id <= 0,
      ) ||
      new Set(projectIds).size !== projectIds.length
    ) {
      throw new BadRequestException('Hãy chọn từ 1 đến 20 công trình hợp lệ.');
    }
    const projects = await this.findProjectAllocationPoints(projectIds as number[]);
    return {
      projects: projects.map(({ project, point }) => ({
        id: project.id,
        ten_cong_trinh: project.ten_cong_trinh,
        dia_diem: project.dia_diem,
        latitude: point.first_latitude ?? point.latitude,
        longitude: point.first_longitude ?? point.longitude,
        lookupLatitude: point.latitude,
        lookupLongitude: point.longitude,
      })),
    };
  }

  @Get('phan-bo/ky-su/:engineerId')
  async engineerProjectAssignments(
    @Param('engineerId', ParseIntPipe) engineerId: number,
    @Req() request: Request,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được xem tiến độ bổ nhiệm.',
      );
    }
    return this.users.findEngineerProjectAssignments(engineerId);
  }

  @Post('phan-bo/assignment/:assignmentId/hoan-thanh')
  async setAssignmentCompletion(
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được cập nhật tiến độ.',
      );
    }
    if (typeof body.completed !== 'boolean') {
      throw new BadRequestException('Trạng thái hoàn thành không hợp lệ.');
    }
    await this.users.setEngineerProjectCompleted(assignmentId, body.completed);
    return { message: 'Đã cập nhật trạng thái hoàn thành công trình.' };
  }

  private async resolveProjectAllocation(projectIds: number[]) {
    const projectsWithPoints = await this.findProjectAllocationPoints(projectIds);
    const resolvedAreas = [];
    for (const { project, point } of projectsWithPoints) {
      const area = await this.assignedAreas.resolveAreaAtPoint(
        point.latitude,
        point.longitude,
        project.dia_diem,
      );
      resolvedAreas.push({ project, point, area });
    }
    const areaNames = [...new Set(resolvedAreas.map(({ area }) => area.name))];
    const uniqueAreas = new Map(
      resolvedAreas.map(({ area }) => [area.name, area]),
    );
    const polygons = [...uniqueAreas.values()].flatMap((area) =>
      area.bounds.geometry?.type === 'Polygon'
        ? [area.bounds.geometry.coordinates]
        : (area.bounds.geometry?.coordinates ?? []),
    );
    if (polygons.length === 0) {
      throw new BadRequestException(
        'Không tìm thấy ranh giới phường/xã cho các công trình đã chọn.',
      );
    }
    const geometry =
      polygons.length === 1
        ? { type: 'Polygon' as const, coordinates: polygons[0] }
        : { type: 'MultiPolygon' as const, coordinates: polygons };
    return { projects: projectsWithPoints.map(({ project }) => project), resolvedAreas, areaNames, geometry };
  }

  private async findProjectAllocationPoints(projectIds: number[]) {
    const foundProjects = await this.service.findAll(projectIds);
    const projectsById = new Map(
      foundProjects.map((project) => [project.id, project]),
    );
    const projects = projectIds
      .map((id) => projectsById.get(id))
      .filter((project) => project !== undefined);
    if (projects.length !== projectIds.length) {
      throw new NotFoundException(
        'Một hoặc nhiều công trình không còn tồn tại.',
      );
    }
    const anchors =
      await this.matBangService.findProjectAnchorPoints(projectIds);
    const anchorsByProject = new Map(
      anchors.map((anchor) => [anchor.cong_trinh_id, anchor]),
    );
    const missingCoordinates = projects.filter(
      (project) => !anchorsByProject.has(project.id),
    );
    if (missingCoordinates.length > 0) {
      throw new BadRequestException(
        `Thiếu tọa độ mặt bằng hợp lệ cho công trình: ${missingCoordinates
          .map((project) => project.ten_cong_trinh || project.id)
          .join(', ')}.`,
      );
    }
    return projects.map((project) => {
      const point = anchorsByProject.get(project.id)!;
      return { project, point };
    });
  }

  private async resolveProjectAllocationFromClient(
    projectIds: number[],
    clientAreas: unknown[],
  ) {
    if (clientAreas.length !== projectIds.length) {
      throw new BadRequestException('Thiếu ranh giới khu vực xem trước.');
    }
    const projectsWithPoints = await this.findProjectAllocationPoints(projectIds);
    const areasByProject = new Map<number, { name: string; geometry: AreaGeometry }>();
    for (const input of clientAreas) {
      if (typeof input !== 'object' || input === null) {
        throw new BadRequestException('Ranh giới khu vực không hợp lệ.');
      }
      const candidate = input as Record<string, unknown>;
      const projectId = candidate.projectId;
      const name = candidate.name;
      const geometry = candidate.geometry as AreaGeometry;
      const bounds = boundsFromAreaGeometry(geometry);
      const project = projectsWithPoints.find(({ project: row }) => row.id === projectId);
      if (
        typeof projectId !== 'number' ||
        typeof name !== 'string' ||
        !name.trim() ||
        !bounds ||
        !project ||
        !isWithinAssignedArea(bounds, project.point.latitude, project.point.longitude)
      ) {
        throw new BadRequestException('Ranh giới không bao quanh tọa độ mặt bằng đã chọn.');
      }
      areasByProject.set(projectId, { name: name.trim(), geometry });
    }
    if (areasByProject.size !== projectIds.length) {
      throw new BadRequestException('Ranh giới công trình bị thiếu hoặc trùng.');
    }
    const resolvedAreas = projectsWithPoints.map(({ project, point }) => {
      const area = areasByProject.get(project.id)!;
      return { project, point, area: { name: area.name, bounds: boundsFromAreaGeometry(area.geometry)! } };
    });
    const areaNames = [...new Set(resolvedAreas.map(({ area }) => area.name))];
    const polygons = [...new Map(resolvedAreas.map(({ area }) => [area.name, area])).values()]
      .flatMap(({ bounds }) => bounds.geometry?.type === 'Polygon'
        ? [bounds.geometry.coordinates]
        : (bounds.geometry?.coordinates ?? []));
    const geometry = polygons.length === 1
      ? { type: 'Polygon' as const, coordinates: polygons[0] }
      : { type: 'MultiPolygon' as const, coordinates: polygons };
    return { projects: projectsWithPoints.map(({ project }) => project), resolvedAreas, areaNames, geometry };
  }

  @Get(':projectId/chi-tiet')
  @Render('chi_tiet_cong_trinh')
  async projectDetails(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('levelAreaPending') levelAreaPending: string | undefined,
    @Req() request: Request,
  ) {
    await this.ensureProjectVisible(projectId, request);
    const [levelOneAreas, levelTwoAreas, levelThreeAreas] = await Promise.all([
      this.service.findSurveyAreasByLevel(projectId, 1),
      this.service.findSurveyAreasByLevel(projectId, 2),
      this.service.findSurveyAreasByLevel(projectId, 3),
    ]);
    return {
      ...(await this.service.findProjectDetails(projectId)),
      levelOneAreas,
      levelTwoAreas,
      levelThreeAreas,
      levelAreaRequestSubmitted: levelAreaPending === '1',
      currentUser: request.authSession ?? null,
    };
  }

  @Post(':projectId/mat-bang-cap/:level')
  async submitLevelSurvey(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('level') levelParam: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    await this.ensureProjectVisible(projectId, request);
    const level = Number(levelParam);
    if (!Number.isInteger(level) || level < 2 || level > 4) {
      throw new BadRequestException('Chỉ hỗ trợ thêm mặt bằng cấp 2, 3 hoặc 4.');
    }
    const parentSurveyId = Number(body.mat_bang_cha_id);
    if (!Number.isSafeInteger(parentSurveyId) || parentSurveyId <= 0) {
      throw new BadRequestException(
        `Mã mặt bằng cấp ${level - 1} không hợp lệ.`,
      );
    }
    if (
      typeof body.ten_mat_bang !== 'string' ||
      typeof body.loai_mat_bang !== 'string' ||
      typeof body.ranh_gioi !== 'string' ||
      typeof body.ma_he_toa_do_nguon !== 'string'
    ) {
      throw new BadRequestException(
        `Thông tin mặt bằng cấp ${level} không đúng định dạng.`,
      );
    }
    await this.service.submitLevelSurveyRequest(
      projectId,
      parentSurveyId,
      level,
      {
        ten_mat_bang: body.ten_mat_bang,
        loai_mat_bang: body.loai_mat_bang,
        ranh_gioi: body.ranh_gioi,
        ma_he_toa_do_nguon: body.ma_he_toa_do_nguon,
      },
      request.authSession?.username ?? 'Không xác định',
    );
    return res.redirect(
      `/cong-trinh/${projectId}/chi-tiet?levelAreaPending=1`,
    );
  }

  @Get(':projectId/xuat-file')
  async exportProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
  ): Promise<StreamableFile> {
    await this.ensureProjectVisible(projectId, request);
    const file = await this.service.exportProjectWorkbook(projectId);
    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="cong-trinh-${projectId}.xlsx"`,
    });
  }

  @Get(':projectId/xuat-bang/:tableKey')
  async exportProjectDetailTable(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('tableKey') tableKey: string,
    @Req() request: Request,
  ): Promise<StreamableFile> {
    const validTableKeys: ProjectDetailTableKey[] = [
      'thong-tin-cong-trinh',
      'mat-bang-cap-1',
      'mat-bang-cap-2',
      'mat-bang-cap-3',
      'mat-bang-cap-4',
      'bang-ho-khoan',
    ];
    if (!validTableKeys.includes(tableKey as ProjectDetailTableKey)) {
      throw new BadRequestException('Bảng công trình cần xuất không hợp lệ.');
    }
    await this.ensureProjectVisible(projectId, request);
    const file = await this.service.exportProjectDetailTable(
      projectId,
      tableKey as ProjectDetailTableKey,
    );
    return new StreamableFile(file, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="cong-trinh-${projectId}-${tableKey}.xlsx"`,
    });
  }

  @Post(':projectId/xoa')
  async deleteProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    await this.ensureProjectVisible(projectId, request);
    await this.service.deleteProject(projectId);
    return res.redirect('/cong-trinh/danh-sach');
  }

  @Get(':projectId/sua')
  @Render('sua_cong_trinh')
  async editProjectPage(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
    @Query('importedHoles') importedHoles: string | undefined,
    @Query('importedSamples') importedSamples: string | undefined,
    @Query('updatedSamples') updatedSamples: string | undefined,
    @Query('pending') pending: string | undefined,
  ) {
    await this.ensureProjectVisible(projectId, request);
    return {
      title: 'Sửa công trình',
      project: await this.service.findOne(projectId),
      surveys: await this.service.findSurveyAreas(projectId),
      importSummary: {
        holes:
          importedHoles && /^\d+$/.test(importedHoles)
            ? Number(importedHoles)
            : null,
        samples:
          importedSamples && /^\d+$/.test(importedSamples)
            ? Number(importedSamples)
            : null,
        updatedSamples:
          updatedSamples && /^\d+$/.test(updatedSamples)
            ? Number(updatedSamples)
            : null,
      },
      pendingEditSubmitted: pending === '1',
    };
  }

  @Post(':projectId/nhap-ho-khoan')
  @UseInterceptors(
    FileInterceptor('hoKhoanExcel', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importProjectBoreholes(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
    @Res() res: Response,
    @UploadedFile() file?: UploadedExcelFile,
  ) {
    await this.ensureProjectVisible(projectId, request);
    if (!file) {
      throw new BadRequestException('Chọn file Excel để nhập hố khoan.');
    }
    if (!/\.(xls|xlsx)$/i.test(file.originalname)) {
      throw new BadRequestException(
        'File hố khoan phải có định dạng .xls hoặc .xlsx.',
      );
    }

    const result = await this.hoKhoanService.importFromExcel(
      file.buffer,
      projectId,
    );
    const query = new URLSearchParams({
      importedHoles: String(result.created),
      importedSamples: String(result.importedSamples),
      updatedSamples: String(result.updatedSamples),
    });
    return res.redirect(
      `/cong-trinh/${projectId}/sua?${query.toString()}`,
    );
  }

  @Post(':projectId/sua')
  async updateProject(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: Record<string, unknown>,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    await this.ensureProjectVisible(projectId, request);
    if (
      (body.ten_cong_trinh !== undefined &&
        typeof body.ten_cong_trinh !== 'string') ||
      (body.dia_diem !== undefined && typeof body.dia_diem !== 'string') ||
      (body.hang_muc !== undefined && typeof body.hang_muc !== 'string') ||
      (body.ghi_chu !== undefined && typeof body.ghi_chu !== 'string')
    ) {
      throw new BadRequestException(
        'Thông tin công trình không đúng định dạng.',
      );
    }

    const surveyIds = body.mat_bang_ids;
    if (typeof surveyIds !== 'string') {
      throw new BadRequestException('Danh sách mặt bằng không hợp lệ.');
    }
    const parsedIds = surveyIds
      ? surveyIds.split(',').map((value) => Number(value))
      : [];
    if (
      parsedIds.some((id) => !Number.isInteger(id) || id <= 0) ||
      new Set(parsedIds).size !== parsedIds.length
    ) {
      throw new BadRequestException('Danh sách mặt bằng không hợp lệ.');
    }

    const surveys: ProjectSurveyUpdateInput[] = parsedIds.map((id) => {
      const prefix = `mat_bang_${id}_`;
      const capValue = body[`${prefix}cap_mat_bang`];
      if (capValue !== undefined && typeof capValue !== 'string') {
        throw new BadRequestException(
          `Thông tin cấp mặt bằng ${id} không đúng định dạng.`,
        );
      }
      const readField = (field: keyof ProjectSurveyInput): string => {
        const value = body[`${prefix}${field}`];
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Thông tin mặt bằng ${id} không đúng định dạng.`,
          );
        }
        return value;
      };
      return {
        id,
        cap_mat_bang: typeof capValue === 'string' ? capValue : null,
        ten_mat_bang: readField('ten_mat_bang'),
        loai_mat_bang: readField('loai_mat_bang'),
        ranh_gioi: readField('ranh_gioi'),
        ma_he_toa_do_nguon: readField('ma_he_toa_do_nguon'),
        trang_thai: readField('trang_thai'),
      };
    });

    await this.service.submitProjectEdit(
      projectId,
      {
        ten_cong_trinh: body.ten_cong_trinh ?? null,
        dia_diem: body.dia_diem ?? null,
        hang_muc: body.hang_muc ?? null,
        ghi_chu: body.ghi_chu ?? null,
      },
      surveys,
      request.authSession?.username ?? 'Không xác định',
    );
    return res.redirect(`/cong-trinh/${projectId}/sua?pending=1`);
  }

  @Get('sua-cho-duyet')
  @Render('duyet_sua_cong_trinh')
  async pendingProjectEdits(@Req() request: Request) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt sửa công trình.',
      );
    }
    return {
      title: 'Duyệt sửa công trình',
      requests: await this.service.findPendingProjectEdits(),
      currentUser: request.authSession,
    };
  }

  @Post('mat-bang-cap-2-cho-duyet/:requestId/duyet')
  async approveLevelTwoSurvey(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt mặt bằng cấp 2.',
      );
    }
    await this.service.approveLevelTwoSurveyRequest(
      requestId,
      request.authSession.username,
    );
    return res.redirect('/cong-trinh/cho-duyet?tab=cap-2');
  }

  @Post('sua-cho-duyet/:requestId/duyet')
  async approveProjectEdit(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    if (request.authSession?.role !== 'quan-tri-vien') {
      throw new ForbiddenException(
        'Chỉ Quản trị viên mới được duyệt sửa công trình.',
      );
    }
    await this.service.approveProjectEdit(
      requestId,
      request.authSession.username,
    );
    return res.redirect('/cong-trinh/sua-cho-duyet');
  }

  @Get(':projectId/lich-su-sua')
  @Render('lich_su_sua_cong_trinh')
  async projectEditHistory(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() request: Request,
  ) {
    await this.ensureProjectVisible(projectId, request);
    return {
      title: 'Lịch sử sửa công trình',
      project: await this.service.findOne(projectId),
      history: await this.service.findProjectEditHistory(projectId),
      currentUser: request.authSession ?? null,
    };
  }

  // API tìm kiếm địa chỉ
  @Get('tim-dia-chi')
  async timDiaChi(@Query('keyword') keyword: string, @Req() request: Request) {
    const data = await this.service.findAll(
      await this.getAssignedProjectIds(request),
    );
    const search = keyword?.trim().toLocaleLowerCase();

    if (!search) {
      return [];
    }

    return data.filter((congTrinh) =>
      congTrinh.dia_diem?.toLocaleLowerCase().includes(search),
    );
  }

  // Trang thêm mới
  @Get('them')
  @Render('them_cong_trinh')
  createPage(@Req() request: Request) {
    return {
      title: 'Tạo dự án mới',
      currentUser: request.authSession ?? null,
    };
  }

  @Get(':projectId/tai-lieu')
  @Render('tai_lieu_cong_trinh')
  async projectDocuments(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Query('uploaded') uploaded: string | undefined,
    @Query('importedHoles') importedHoles: string | undefined,
    @Query('importedSamples') importedSamples: string | undefined,
    @Req() request: Request,
  ) {
    await this.ensureProjectVisible(projectId, request);
    const { project, documents } =
      await this.service.findProjectDocuments(projectId);

    return {
      title: `Tài liệu - ${project.hang_muc || project.ten_cong_trinh}`,
      project,
      documents,
      uploadedCount:
        uploaded && /^\d+$/.test(uploaded) ? Number(uploaded) : null,
      importedHoles:
        importedHoles && /^\d+$/.test(importedHoles)
          ? Number(importedHoles)
          : null,
      importedSamples:
        importedSamples && /^\d+$/.test(importedSamples)
          ? Number(importedSamples)
          : null,
    };
  }

  @Get(':projectId/tai-lieu/:documentId')
  async downloadDocument(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Req() request: Request,
  ) {
    await this.ensureProjectVisible(projectId, request);
    const { document, path } = await this.service.findDocumentForDownload(
      projectId,
      documentId,
    );
    const fallbackName = document.ten_file
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_');
    const disposition = `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(document.ten_file)}`;

    return new StreamableFile(createReadStream(path), {
      type: document.mime_type,
      disposition,
    });
  }

  // Lưu công trình
  @Post('them')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'files', maxCount: 10 },
        { name: 'hoKhoanExcel', maxCount: 1 },
      ],
      {
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  async store(
    @Body() body: CreateProjectBody,
    @Req() request: Request,
    @Res() res: Response,
    @UploadedFiles() uploads: ProjectUploadFields = {},
  ) {
    const files = uploads.files ?? [];
    const excelFile = uploads.hoKhoanExcel?.[0];

    if (
      (body.ten_cong_trinh !== undefined &&
        typeof body.ten_cong_trinh !== 'string') ||
      (body.dia_diem !== undefined && typeof body.dia_diem !== 'string') ||
      (body.hang_muc !== undefined && typeof body.hang_muc !== 'string') ||
      (body.ghi_chu !== undefined && typeof body.ghi_chu !== 'string')
    ) {
      throw new BadRequestException(
        'Thông tin công trình không đúng định dạng.',
      );
    }

    if (excelFile) {
      if (!/\.(xls|xlsx)$/i.test(excelFile.originalname)) {
        throw new BadRequestException(
          'File hố khoan phải có định dạng .xls hoặc .xlsx.',
        );
      }
    }

    const creatorId =
      request.authSession?.role === 'ky-su'
        ? (
            await this.users.findAccountByUsername(
              request.authSession.username,
            )
          ).ma_nguoi_dung
        : null;

    const project = await this.service.create(
      {
        ten_cong_trinh: body.ten_cong_trinh,

        dia_diem: body.dia_diem,

        hang_muc: body.hang_muc,

        ghi_chu: body.ghi_chu,

        nguoi_tao: creatorId,
      },
      body.documentType || 'Tài liệu khác',
      files,
      {
        ten_mat_bang: body.ten_mat_bang,
        loai_mat_bang: body.loai_mat_bang,
        cap_mat_bang: body.cap_mat_bang,
        ranh_gioi: body.ranh_gioi,
        ma_he_toa_do_nguon: body.ma_he_toa_do_nguon,
        trang_thai: 'cho_xac_minh',
      },
    );

    let importResult:
      Awaited<ReturnType<HoKhoanService['importFromExcel']>> | undefined;
    if (excelFile) {
      importResult = await this.hoKhoanService.importFromExcel(
        excelFile.buffer,
        project.id,
      );
    }

    const query = new URLSearchParams();
    if (files.length > 0) {
      query.set('uploaded', String(files.length));
    }
    if (importResult) {
      query.set('importedHoles', String(importResult.created));
      query.set(
        'importedSamples',
        String(importResult.importedSamples + importResult.updatedSamples),
      );
    }
    const queryString = query.toString();

    if (request.authSession?.role === 'ky-su') {
      return res.redirect('/cong-trinh/da-tao?created=pending');
    }

    return res.redirect(
      `/cong-trinh/${project.id}/tai-lieu${queryString ? `?${queryString}` : ''}`,
    );
  }

  private async getAssignedProjectIds(
    request: Request,
  ): Promise<number[] | undefined> {
    const session = request.authSession;
    if (!session || session.role !== 'ky-su') {
      return undefined;
    }

    const account = await this.users.findAccountByUsername(session.username);
    const assignmentAccess = await this.users.findProjectAssignmentAccess(
      account.ma_nguoi_dung,
    );
    return assignmentAccess.activeProjectIds;
  }

  private async ensureProjectVisible(
    projectId: number,
    request: Request,
  ): Promise<void> {
    const allowedProjectIds = await this.getAssignedProjectIds(request);
    if (
      allowedProjectIds !== undefined &&
      !allowedProjectIds.includes(projectId)
    ) {
      throw new NotFoundException(
        'Không tìm thấy công trình trong khu vực được phân công.',
      );
    }
  }
}
