import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Render,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { Request, Response } from 'express';
import type { AuthSession } from '../../xac-thuc/phien-xac-thuc.service.js';
import {
  LOGIN_ROLES,
  type LoginRoleSlug,
} from '../../xac-thuc/vai-tro-dang-nhap.js';
import { AssignedAreaService } from './khu-vuc-phan-cong.service.js';
import {
  boundsFromAreaGeometry,
  isWithinAssignedArea,
  pointWithinAssignedArea,
  type AreaGeometry,
} from './khu-vuc-phan-cong.util.js';
import { NguoiDungService } from './nguoi-dung.service.js';
import { isValidAssignmentDate } from '../../xac-thuc/thoi-han-phan-cong.util.js';
import {
  DEFAULT_PAGES_BY_PERMISSION,
  SYSTEM_PAGES,
  SYSTEM_PERMISSIONS,
  PERMISSION_MODES,
  UyQuyenService,
  type PermissionMode,
  type SystemPermissionId,
} from '../uy-quyen/uy-quyen.service.js';

interface AccountFormBody {
  nguoi_dung_role_scope?: unknown;
  ten_dang_nhap?: unknown;
  ho_ten?: unknown;
  email?: unknown;
  dia_chi?: unknown;
  so_dien_thoai?: unknown;
  ma_ky_su?: unknown;
  chuyen_nganh?: unknown;
  don_vi_cong_tac?: unknown;
  so_chung_chi_hanh_nghe?: unknown;
  trang_thai?: unknown;
  khu_vuc_duoc_xem?: unknown;
  khu_vuc_phan_cong_ranh_gioi?: unknown;
  khu_vuc_phan_cong_vi_do?: unknown;
  khu_vuc_phan_cong_kinh_do?: unknown;
  khu_vuc_phan_cong_tu_ngay?: unknown;
  khu_vuc_phan_cong_den_ngay?: unknown;
  mat_khau?: unknown;
  cong_vai_tro?: unknown;
  duoc_dang_nhap?: unknown;
}

type AuthenticatedRequest = Request & { authSession?: AuthSession };

const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const ACCOUNT_STATUSES = ['CHO_DUYET', 'DA_DUYET', 'TU_CHOI'] as const;

@Controller('nguoi-dung')
export class NguoiDungController {
  constructor(
    private readonly service: NguoiDungService,
    private readonly assignedAreas: AssignedAreaService,
    private readonly authorization: UyQuyenService,
  ) {}

  @Get('khu-vuc-phan-cong')
  async assignedAreaBounds(@Req() request: Request) {
    const username = request.authSession?.username;
    if (!username || request.authSession?.role !== 'ky-su') {
      throw new BadRequestException(
        'Chức năng này chỉ dành cho tài khoản Kỹ sư.',
      );
    }
    const account = await this.service.findAccountByUsername(username);
    const assignmentAccess = await this.service.findProjectAssignmentAccess(
      account.ma_nguoi_dung,
    );
    const assignedArea = (
      assignmentAccess.hasAssignments
        ? assignmentAccess.activeAreaName
        : account.khu_vuc_duoc_xem
    )?.trim();
    if (!assignedArea) {
      throw new BadRequestException('Tài khoản chưa được phân công khu vực.');
    }
    const assignedGeometry = assignmentAccess.hasAssignments
      ? assignmentAccess.activeGeometry
      : account.khu_vuc_phan_cong_ranh_gioi;
    const bounds = assignedGeometry
      ? boundsFromAreaGeometry(assignedGeometry)
      : null;
    const resolvedBounds =
      bounds ?? (await this.assignedAreas.resolveBounds(assignedArea));
    const pinnedLatitude = assignmentAccess.hasAssignments
      ? assignmentAccess.activeLatitude
      : account.khu_vuc_phan_cong_vi_do;
    const pinnedLongitude = assignmentAccess.hasAssignments
      ? assignmentAccess.activeLongitude
      : account.khu_vuc_phan_cong_kinh_do;
    const hasPinnedCenter =
      pinnedLatitude !== null &&
      pinnedLongitude !== null &&
      isWithinAssignedArea(resolvedBounds, pinnedLatitude, pinnedLongitude);
    const areaCenter = pointWithinAssignedArea(resolvedBounds);
    return {
      area: assignedArea,
      bounds: resolvedBounds,
      center: {
        latitude: hasPinnedCenter
          ? pinnedLatitude
          : (areaCenter?.latitude ??
            (resolvedBounds.south + resolvedBounds.north) / 2),
        longitude: hasPinnedCenter
          ? pinnedLongitude
          : (areaCenter?.longitude ??
            (resolvedBounds.west + resolvedBounds.east) / 2),
        isPinned: hasPinnedCenter,
      },
    };
  }

  @Get()
  @Render('tai_khoan_danh_sach')
  async index(@Req() request: Request) {
    return {
      title: 'Quản lý tài khoản Quản trị viên',
      roles: LOGIN_ROLES,
      selectedRole: 'quan-tri-vien',
      accountStatuses: ACCOUNT_STATUSES,
      accounts: await this.service.findAll('quan-tri-vien'),
      currentUser: request.authSession ?? null,
    };
  }

  @Get('quyen/:role')
  @Render('tai_khoan_danh_sach')
  async accountsByRole(
    @Param('role') roleSlug: string,
    @Req() request: Request,
  ) {
    const role = LOGIN_ROLES.find((item) => item.slug === roleSlug);
    if (!role) {
      throw new BadRequestException('Nhóm quyền không hợp lệ.');
    }
    return {
      title: `Quản lý tài khoản ${role.title}`,
      roles: LOGIN_ROLES,
      selectedRole: role.slug,
      accountStatuses: ACCOUNT_STATUSES,
      accounts: await this.service.findAll(role.slug),
      currentUser: request.authSession ?? null,
    };
  }

  @Get('uy-quyen')
  @Render('uy_quyen')
  async authorizationPage(
    @Query('role') roleSlug?: string,
    @Query('accountId') accountIdValue?: string,
    @Query('saved') saved?: string,
  ) {
    const selectedRole = LOGIN_ROLES.find((role) => role.slug === roleSlug);
    const accounts = selectedRole
      ? await this.service.findAllForPortal(selectedRole.slug)
      : [];
    let selectedAccount: Awaited<ReturnType<NguoiDungService['findAccount']>> | null =
      null;
    let permissionModes: Record<SystemPermissionId, PermissionMode> =
      Object.fromEntries(
        SYSTEM_PERMISSIONS.map(({ id }) => [id, 'cam']),
      ) as Record<SystemPermissionId, PermissionMode>;
    let globalPermissionIds: SystemPermissionId[] = [];
    let pagePlacements: Record<string, string[]> = {};

    if (accountIdValue !== undefined) {
      const accountId = Number(accountIdValue);
      if (
        !selectedRole ||
        !Number.isSafeInteger(accountId) ||
        accountId < 1
      ) {
        throw new BadRequestException('Cổng hoặc tài khoản không hợp lệ.');
      }
      selectedAccount = await this.service.findAccount(accountId);
      if (!selectedAccount.cong_vai_tro.includes(selectedRole.slug)) {
        throw new BadRequestException('Tài khoản không thuộc cổng đã chọn.');
      }
      globalPermissionIds =
        await this.authorization.getEnabledPermissionIds();
      permissionModes =
        await this.authorization.getAccountPermissionModes(accountId);
      pagePlacements =
        await this.authorization.getAccountPagePlacements(accountId);
    }

    return {
      title: 'Ủy quyền tài khoản',
      roles: LOGIN_ROLES,
      selectedRole: selectedRole?.slug ?? '',
      accounts,
      selectedAccount,
      permissions: SYSTEM_PERMISSIONS,
      pages: SYSTEM_PAGES,
      defaultPagesByPermission: DEFAULT_PAGES_BY_PERMISSION,
      permissionModes,
      globalPermissionIds,
      pagePlacements,
      permissionModesList: PERMISSION_MODES,
      saved: saved === '1',
    };
  }

  @Post('uy-quyen')
  async saveAuthorization(
    @Body() body: Record<string, unknown>,
    @Res() response: Response,
  ): Promise<void> {
    const roleSlug = body.role;
    const accountIdValue = body.accountId;
    const selectedRole =
      typeof roleSlug === 'string'
        ? LOGIN_ROLES.find((role) => role.slug === roleSlug)
        : undefined;
    const accountId =
      typeof accountIdValue === 'string' ? Number(accountIdValue) : NaN;
    if (
      !selectedRole ||
      !Number.isSafeInteger(accountId) ||
      accountId < 1
    ) {
      throw new BadRequestException('Cổng hoặc tài khoản không hợp lệ.');
    }

    const permissionModes: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith('permission_')) continue;
      if (
        typeof value !== 'string' ||
        !PERMISSION_MODES.includes(value as (typeof PERMISSION_MODES)[number])
      ) {
        throw new BadRequestException(
          'Danh sách trạng thái quyền không hợp lệ.',
        );
      }
      permissionModes[key.slice('permission_'.length)] = value;
    }

    const pagePlacements: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith('pages_')) continue;
      const permissionId = key.slice('pages_'.length);
      const pageIds =
        typeof value === 'string'
          ? [value]
          : Array.isArray(value) &&
              value.every((item): item is string => typeof item === 'string')
            ? value
            : null;
      if (!pageIds) {
        throw new BadRequestException(
          'Danh sách trang hiển thị quyền không hợp lệ.',
        );
      }
      pagePlacements[permissionId] = pageIds;
    }
    for (const [key, value] of Object.entries(body)) {
      if (!key.startsWith('page_configured_')) continue;
      if (value !== '1') {
        throw new BadRequestException(
          'Danh sách trang hiển thị quyền không hợp lệ.',
        );
      }
      const permissionId = key.slice('page_configured_'.length);
      pagePlacements[permissionId] ??= [];
    }

    const account = await this.service.findAccount(accountId);
    if (!account.cong_vai_tro.includes(selectedRole.slug)) {
      throw new BadRequestException('Tài khoản không thuộc cổng đã chọn.');
    }

    await this.authorization.setAccountPermissionModes(
      accountId,
      permissionModes,
      pagePlacements,
    );
    response.redirect(
      `/nguoi-dung/uy-quyen?role=${selectedRole.slug}&accountId=${accountId}&saved=1`,
    );
  }

  @Get('them')
  @Render('tai_khoan_chi_tiet')
  createPage(@Query('role') roleSlug?: string) {
    const selectedRole = LOGIN_ROLES.find(
      (item) => item.slug === roleSlug,
    )?.slug;
    return {
      title: 'Thêm tài khoản',
      roles: LOGIN_ROLES,
      selectedRole,
      accountStatuses: ACCOUNT_STATUSES,
      account: null,
      error: null,
    };
  }

  @Get('ho-so')
  @Render('ho_so_ky_su')
  async profile(@Req() request: Request) {
    const username = request.authSession?.username;
    if (!username) {
      throw new BadRequestException('Không tìm thấy phiên đăng nhập.');
    }
    const account = await this.service.findAccountByUsername(username);
    const avatarPath = await this.service.findAvatarPath(account.ma_nguoi_dung);
    const role = LOGIN_ROLES.find(
      (item) => item.slug === request.authSession?.role,
    );
    return {
      account,
      avatarUrl: avatarPath ? '/nguoi-dung/ho-so/anh' : null,
      currentUser: request.authSession ?? null,
      roleTitle: role?.title ?? 'Tài khoản',
    };
  }

  @Get('ho-so/anh')
  @Header('Cache-Control', 'private, no-store')
  async profileAvatar(@Req() request: Request): Promise<StreamableFile> {
    const username = request.authSession?.username;
    if (!username) {
      throw new BadRequestException('Không tìm thấy phiên đăng nhập.');
    }
    const account = await this.service.findAccountByUsername(username);
    const avatarPath = await this.service.findAvatarPath(account.ma_nguoi_dung);
    if (!avatarPath) {
      throw new NotFoundException('Tài khoản chưa có ảnh đại diện.');
    }
    const contentType: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    return new StreamableFile(createReadStream(avatarPath), {
      type:
        contentType[extname(avatarPath).toLowerCase()] ??
        'application/octet-stream',
      disposition: 'inline',
    });
  }

  @Post('ho-so/anh')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadProfileAvatar(
    @Req() request: Request,
    @Res() response: Response,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ): Promise<void> {
    const username = request.authSession?.username;
    if (!username) {
      throw new BadRequestException('Không tìm thấy phiên đăng nhập.');
    }
    if (!file) {
      throw new BadRequestException('Vui lòng chọn ảnh đại diện.');
    }
    const account = await this.service.findAccountByUsername(username);
    await this.service.saveAvatar(account.ma_nguoi_dung, file);
    response.redirect('/nguoi-dung/ho-so');
  }

  @Post('them')
  async create(
    @Body() body: AccountFormBody,
    @Res() response: Response,
  ): Promise<void> {
    const input = this.parseBody(body, true);
    await this.service.createAccount(input);
    response.redirect(`/nguoi-dung/quyen/${input.cong_vai_tro[0]}`);
  }

  @Get(':id/anh')
  @Header('Cache-Control', 'private, max-age=300')
  async accountAvatar(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<StreamableFile> {
    const avatarPath = await this.service.findAvatarPath(id);
    if (!avatarPath) {
      throw new NotFoundException('Tài khoản chưa có ảnh đại diện.');
    }
    const contentType: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
    };
    return new StreamableFile(createReadStream(avatarPath), {
      type:
        contentType[extname(avatarPath).toLowerCase()] ??
        'application/octet-stream',
      disposition: 'inline',
    });
  }

  @Get(':id/chi-tiet')
  @Render('tai_khoan_xem_chi_tiet')
  async accountDetails(
    @Param('id', ParseIntPipe) id: number,
    @Query('role') roleSlug?: string,
    @Query('embed') embed?: string,
  ) {
    const account = await this.service.findAccount(id);
    const avatarPath = await this.service.findAvatarPath(account.ma_nguoi_dung);
    return {
      title: 'Chi tiết tài khoản',
      roles: LOGIN_ROLES,
      selectedRole: LOGIN_ROLES.find((item) => item.slug === roleSlug)?.slug,
      account,
      avatarUrl: avatarPath ? `/nguoi-dung/${account.ma_nguoi_dung}/anh` : null,
      embedded: embed === '1',
    };
  }

  @Get(':id')
  @Render('tai_khoan_chi_tiet')
  async detail(
    @Param('id', ParseIntPipe) id: number,
    @Query('role') roleSlug?: string,
  ) {
    return {
      title: 'Thông tin tài khoản',
      roles: LOGIN_ROLES,
      selectedRole: LOGIN_ROLES.find((item) => item.slug === roleSlug)?.slug,
      accountStatuses: ACCOUNT_STATUSES,
      account: await this.service.findAccount(id),
      error: null,
    };
  }

  @Post(':id/cap-nhat')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AccountFormBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const input = this.parseBody(body, false);
    const currentUsername = (request as AuthenticatedRequest).authSession
      ?.username;
    if (
      currentUsername === (await this.service.findAccount(id)).ten_dang_nhap &&
      (!input.duoc_dang_nhap || !input.cong_vai_tro.includes('quan-tri-vien'))
    ) {
      throw new BadRequestException(
        'Không thể tự tắt quyền đăng nhập hoặc quyền Quản trị viên của chính mình.',
      );
    }

    await this.service.updateAccount(id, input);
    const requestedRole = body.nguoi_dung_role_scope;
    const selectedRole =
      LOGIN_ROLES.find((item) => item.slug === requestedRole)?.slug ??
      input.cong_vai_tro[0];
    response.redirect(`/nguoi-dung/quyen/${selectedRole}`);
  }

  @Post(':id/duyet')
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AccountFormBody,
    @Res() response: Response,
  ): Promise<void> {
    await this.service.approveAccount(id);
    const selectedRole =
      LOGIN_ROLES.find((item) => item.slug === body.nguoi_dung_role_scope)
        ?.slug ?? 'quan-tri-vien';
    response.redirect(`/nguoi-dung/quyen/${selectedRole}`);
  }

  @Post(':id/xoa')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AccountFormBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (
      (request as AuthenticatedRequest).authSession?.username ===
      (await this.service.findAccount(id)).ten_dang_nhap
    ) {
      throw new BadRequestException('Không thể xóa tài khoản đang đăng nhập.');
    }
    await this.service.deleteAccount(id);
    const requestedRole = body.nguoi_dung_role_scope;
    const selectedRole =
      LOGIN_ROLES.find((item) => item.slug === requestedRole)?.slug ??
      'quan-tri-vien';
    response.redirect(`/nguoi-dung/quyen/${selectedRole}`);
  }

  private parseBody(
    body: AccountFormBody,
    isNew: boolean,
  ): {
    ten_dang_nhap: string;
    ho_ten: string;
    email: string | null;
    dia_chi: string | null;
    so_dien_thoai: string | null;
    ma_ky_su: string | null;
    chuyen_nganh: string | null;
    don_vi_cong_tac: string | null;
    so_chung_chi_hanh_nghe: string | null;
    trang_thai: string;
    khu_vuc_duoc_xem: string | null;
    khu_vuc_phan_cong_ranh_gioi: AreaGeometry | null;
    khu_vuc_phan_cong_vi_do: number | null;
    khu_vuc_phan_cong_kinh_do: number | null;
    khu_vuc_phan_cong_tu_ngay: string | null;
    khu_vuc_phan_cong_den_ngay: string | null;
    mat_khau?: string;
    cong_vai_tro: LoginRoleSlug[];
    duoc_dang_nhap: boolean;
  } {
    const username =
      typeof body.ten_dang_nhap === 'string' ? body.ten_dang_nhap.trim() : '';
    const fullName = typeof body.ho_ten === 'string' ? body.ho_ten.trim() : '';
    const optionalText = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : null;
    const email = optionalText(body.email);
    const address = optionalText(body.dia_chi);
    const phone = optionalText(body.so_dien_thoai);
    const engineerCode = optionalText(body.ma_ky_su);
    const specialty = optionalText(body.chuyen_nganh);
    const organization = optionalText(body.don_vi_cong_tac);
    const certificate = optionalText(body.so_chung_chi_hanh_nghe);
    const viewingArea = optionalText(body.khu_vuc_duoc_xem);
    const assignedStartDate = this.parseAssignmentDate(
      body.khu_vuc_phan_cong_tu_ngay,
    );
    const assignedEndDate = this.parseAssignmentDate(
      body.khu_vuc_phan_cong_den_ngay,
    );
    if ((assignedStartDate === null) !== (assignedEndDate === null)) {
      throw new BadRequestException(
        'Cần nhập cả ngày bắt đầu và ngày kết thúc phân công.',
      );
    }
    if (
      assignedStartDate !== null &&
      assignedEndDate !== null &&
      assignedStartDate > assignedEndDate
    ) {
      throw new BadRequestException(
        'Ngày bắt đầu phân công không được sau ngày kết thúc.',
      );
    }
    const assignedGeometry = this.parseAssignedGeometry(
      body.khu_vuc_phan_cong_ranh_gioi,
    );
    const assignedLatitude = this.parseAssignedCoordinate(
      body.khu_vuc_phan_cong_vi_do,
      'vĩ độ',
    );
    const assignedLongitude = this.parseAssignedCoordinate(
      body.khu_vuc_phan_cong_kinh_do,
      'kinh độ',
    );
    if ((assignedLatitude === null) !== (assignedLongitude === null)) {
      throw new BadRequestException(
        'Tọa độ khu vực phân công cần có đủ vĩ độ và kinh độ.',
      );
    }
    if (
      assignedLatitude !== null &&
      (assignedLatitude < 6 ||
        assignedLatitude > 24 ||
        assignedLongitude === null ||
        assignedLongitude < 101 ||
        assignedLongitude > 118)
    ) {
      throw new BadRequestException(
        'Tọa độ ghim khu vực phân công phải nằm trong phạm vi Việt Nam.',
      );
    }
    if (
      assignedGeometry &&
      assignedLatitude !== null &&
      assignedLongitude !== null
    ) {
      const bounds = boundsFromAreaGeometry(assignedGeometry);
      if (
        !bounds ||
        !isWithinAssignedArea(bounds, assignedLatitude, assignedLongitude)
      ) {
        throw new BadRequestException(
          'Tọa độ ghim phải nằm trong ranh giới khu vực phân công.',
        );
      }
    }
    if (assignedGeometry && assignedLatitude === null) {
      throw new BadRequestException(
        'Cần ghim một vị trí nằm trong ranh giới khu vực được phân công.',
      );
    }
    const status =
      typeof body.trang_thai === 'string' ? body.trang_thai : 'CHO_DUYET';
    const password = typeof body.mat_khau === 'string' ? body.mat_khau : '';
    const roles = Array.isArray(body.cong_vai_tro)
      ? body.cong_vai_tro
      : typeof body.cong_vai_tro === 'string'
        ? [body.cong_vai_tro]
        : [];
    const validRoleSlugs = new Set<string>(
      LOGIN_ROLES.map((role) => role.slug),
    );
    if (
      username.length < 2 ||
      username.length > 100 ||
      !USERNAME_PATTERN.test(username)
    ) {
      throw new BadRequestException(
        'Tên đăng nhập cần dài 2-100 ký tự và chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.',
      );
    }
    if (fullName.length > 255) {
      throw new BadRequestException('Họ tên không được vượt quá 255 ký tự.');
    }
    const limitedFields: Array<[string, string | null, number]> = [
      ['Email', email, 255],
      ['Địa chỉ', address, Number.MAX_SAFE_INTEGER],
      ['Số điện thoại', phone, 20],
      ['Mã kỹ sư', engineerCode, 50],
      ['Chuyên ngành', specialty, 100],
      ['Đơn vị công tác', organization, 255],
      ['Số chứng chỉ hành nghề', certificate, 100],
    ];
    for (const [label, value, maxLength] of limitedFields) {
      if (value && value.length > maxLength) {
        throw new BadRequestException(`${label} vượt quá độ dài cho phép.`);
      }
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email không đúng định dạng.');
    }
    if (
      status.length > 20 ||
      !ACCOUNT_STATUSES.includes(status as (typeof ACCOUNT_STATUSES)[number])
    ) {
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ.');
    }
    if (isNew && (password.length < 8 || password.length > 255)) {
      throw new BadRequestException('Mật khẩu mới cần dài từ 8-255 ký tự.');
    }
    if (password && password.length < 8) {
      throw new BadRequestException('Mật khẩu mới cần dài ít nhất 8 ký tự.');
    }
    if (password.length > 255) {
      throw new BadRequestException('Mật khẩu không được vượt quá 255 ký tự.');
    }
    if (
      roles.length === 0 ||
      roles.some(
        (role) => typeof role !== 'string' || !validRoleSlugs.has(role),
      )
    ) {
      throw new BadRequestException('Hãy chọn ít nhất một cổng đăng nhập.');
    }

    return {
      ten_dang_nhap: username,
      ho_ten: fullName,
      email,
      dia_chi: address,
      so_dien_thoai: phone,
      ma_ky_su: engineerCode,
      chuyen_nganh: specialty,
      don_vi_cong_tac: organization,
      so_chung_chi_hanh_nghe: certificate,
      trang_thai: status,
      khu_vuc_duoc_xem: viewingArea,
      khu_vuc_phan_cong_ranh_gioi: assignedGeometry,
      khu_vuc_phan_cong_vi_do: assignedLatitude,
      khu_vuc_phan_cong_kinh_do: assignedLongitude,
      khu_vuc_phan_cong_tu_ngay: assignedStartDate,
      khu_vuc_phan_cong_den_ngay: assignedEndDate,
      mat_khau: password || undefined,
      cong_vai_tro: roles as LoginRoleSlug[],
      duoc_dang_nhap: body.duoc_dang_nhap === 'true',
    };
  }

  private parseAssignmentDate(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !isValidAssignmentDate(value)) {
      throw new BadRequestException('Ngày phân công không hợp lệ.');
    }
    return value;
  }

  private parseAssignedGeometry(value: unknown): AreaGeometry | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || value.length > 8_000_000) {
      throw new BadRequestException(
        'Ranh giới khu vực phân công không hợp lệ.',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new BadRequestException(
        'Không thể đọc dữ liệu ranh giới khu vực phân công.',
        { cause: error },
      );
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('type' in parsed) ||
      !('coordinates' in parsed) ||
      (parsed.type !== 'Polygon' && parsed.type !== 'MultiPolygon') ||
      !Array.isArray(parsed.coordinates)
    ) {
      throw new BadRequestException(
        'Ranh giới khu vực phân công không hợp lệ.',
      );
    }
    const geometry = parsed as AreaGeometry;
    try {
      if (!boundsFromAreaGeometry(geometry)) {
        throw new BadRequestException(
          'Ranh giới khu vực phân công không có tọa độ hợp lệ.',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Tọa độ ranh giới khu vực phân công không hợp lệ.',
        { cause: error },
      );
    }
    return geometry;
  }

  private parseAssignedCoordinate(
    value: unknown,
    label: string,
  ): number | null {
    if (value === undefined || value === null || value === '') return null;
    const coordinate =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(coordinate)) {
      throw new BadRequestException(`Giá trị ${label} ghim không hợp lệ.`);
    }
    return coordinate;
  }
}
