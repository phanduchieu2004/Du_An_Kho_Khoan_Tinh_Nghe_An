import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthSessionService } from './phien-xac-thuc.service.js';
import type { LoginRoleSlug } from './vai-tro-dang-nhap.js';
import { IS_PUBLIC_KEY } from './cong-khai.decorator.js';
import { NguoiDungService } from '../phan-he/nguoi-dung/nguoi-dung.service.js';
import { isWithinAssignmentPeriod } from './thoi-han-phan-cong.util.js';
import { UyQuyenService } from '../phan-he/uy-quyen/uy-quyen.service.js';

const SESSION_COOKIE = 'hk_session';
const LOGIN_ROLE_PATH =
  /^\/dang-nhap\/(?:ky-su|quan-tri-vien|quan-ly-khu-vuc|nguoi-xem-ban-do)$/;
const ADMIN_ONLY_PATHS = new Set(['/nguoi-dung', '/vai-tro']);
const ENGINEER_ADMIN_PREFIXES = [
  '/cong-trinh',
  '/ho-khoan',
  '/lop-dat',
  '/mau-thi-nghiem',
  '/thanh-phan-hat',
  '/cat-phang',
  '/gia-tri-trung-binh-lop',
  '/mat-bang',
  '/records',
  '/upload',
  '/xuat-file',
];
const MAP_VIEW_PATHS = new Set([
  '/ho-khoan/api',
  '/mat-bang/api',
  '/mat-bang/api/cap-2',
]);
const ENGINEER_ADMIN_ROLES: LoginRoleSlug[] = ['ky-su', 'quan-tri-vien'];

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: AuthSessionService,
    private readonly users: NguoiDungService,
    private readonly permissions: UyQuyenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || this.isPublicRoute(request)) {
      return true;
    }

    const response = http.getResponse<Response>();
    const session = this.sessions.verify(this.getSessionToken(request));

    if (!session) {
      if (this.isApiRoute(request)) {
        response
          .status(401)
          .json({ message: 'Vui lòng đăng nhập để tiếp tục.' });
        return false;
      }
      response.redirect('/dang-nhap');
      return false;
    }

    const access = await this.users.findAccess(session.username);
    if (
      !access ||
      !access.duoc_dang_nhap ||
      !access.cong_vai_tro.includes(session.role)
    ) {
      response.clearCookie(SESSION_COOKIE, { path: '/' });
      if (this.isApiRoute(request)) {
        response
          .status(401)
          .json({ message: 'Tài khoản đã bị khóa hoặc đổi quyền.' });
        return false;
      }
      response.redirect('/dang-nhap');
      return false;
    }

    const allowedRoles = this.getAllowedRoles(request);
    if (!allowedRoles.includes(session.role)) {
      const message = this.getRoleErrorMessage(allowedRoles);
      if (this.isApiRoute(request)) {
        response.status(403).json({ message });
        return false;
      }
      response.redirect(`/dang-nhap/${allowedRoles[0]}`);
      return false;
    }

    const requiredPermission =
      this.permissions.getPermissionForRequest(request);
    if (
      requiredPermission &&
      !(await this.permissions.isAllowedForAccount(
        requiredPermission.id,
        access.ma_nguoi_dung,
        request.method,
        request.path,
      ))
    ) {
      const message = `Chức năng "${requiredPermission.title}" hiện chưa được ủy quyền.`;
      if (this.isApiRoute(request)) {
        response.status(403).json({ message });
      } else {
        response.status(403).send(message);
      }
      return false;
    }

    if (
      session.role === 'ky-su' &&
      this.isAssignmentRestrictedRoute(request) &&
      (access.hasProjectAssignments
        ? !access.hasActiveProjectAssignments
        : !isWithinAssignmentPeriod(
            access.khu_vuc_phan_cong_tu_ngay,
            access.khu_vuc_phan_cong_den_ngay,
          ))
    ) {
      const message = 'Khu vực phân công chưa có hiệu lực hoặc đã hết hạn.';
      if (this.isApiRoute(request)) {
        response.status(403).json({ message });
      } else {
        response.status(403).send(message);
      }
      return false;
    }

    request.authSession = session;
    return true;
  }

  private isAssignmentRestrictedRoute(request: Request): boolean {
    return (
      request.path === '/nguoi-dung/khu-vuc-phan-cong' ||
      ENGINEER_ADMIN_PREFIXES.some(
        (prefix) =>
          request.path === prefix || request.path.startsWith(`${prefix}/`),
      )
    );
  }

  private isPublicRoute(request: Request): boolean {
    if (request.method === 'GET' && request.path === '/dang-nhap') {
      return true;
    }

    if (
      (request.method === 'GET' || request.method === 'POST') &&
      LOGIN_ROLE_PATH.test(request.path)
    ) {
      return true;
    }

    return request.method === 'POST' && request.path === '/dang-xuat';
  }

  private getAllowedRoles(request: Request): LoginRoleSlug[] {
    const path = request.path;
    const recordTable = path.match(/^\/records\/([^/]+)\//)?.[1];

    if (
      path === '/ho-tro' ||
      path.startsWith('/ho-tro/') ||
      (request.method === 'GET' &&
        (/^\/nguoi-dung\/\d+\/anh$/.test(path) ||
          (/^\/nguoi-dung\/\d+\/chi-tiet$/.test(path) &&
            request.query.embed === '1')))
    ) {
      return ['ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc'];
    }

    if (path === '/quan-ly-khu-vuc' || path.startsWith('/quan-ly-khu-vuc/')) {
      return ['quan-ly-khu-vuc'];
    }

    if (path.startsWith('/nguoi-dung/ho-so')) {
      return ['ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc', 'nguoi-xem-ban-do'];
    }

    if (path === '/nguoi-dung/khu-vuc-phan-cong') {
      return ['ky-su'];
    }

    if (
      ADMIN_ONLY_PATHS.has(path) ||
      path.startsWith('/nguoi-dung/') ||
      path.startsWith('/vai-tro/') ||
      recordTable === 'nguoi_dung' ||
      recordTable === 'vai_tro'
    ) {
      return ['quan-tri-vien'];
    }

    if (request.method === 'GET' && MAP_VIEW_PATHS.has(path)) {
      return ['ky-su', 'quan-tri-vien', 'nguoi-xem-ban-do'];
    }

    if (
      ENGINEER_ADMIN_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    ) {
      return ENGINEER_ADMIN_ROLES;
    }

    return ENGINEER_ADMIN_ROLES;
  }

  private getRoleErrorMessage(roles: LoginRoleSlug[]): string {
    if (roles.length === 1 && roles[0] === 'quan-tri-vien') {
      return 'Chức năng này chỉ dành cho Quản trị viên.';
    }
    return 'Chức năng này cần tài khoản Kỹ sư hoặc Quản trị viên.';
  }

  private isApiRoute(request: Request): boolean {
    return (
      request.path.includes('/api') ||
      request.path === '/nguoi-dung/khu-vuc-phan-cong' ||
      request.path.startsWith('/xuat-file') ||
      request.path.startsWith('/upload')
    );
  }

  private getSessionToken(request: Request): string | undefined {
    const cookies = request.headers.cookie?.split(';') ?? [];
    const sessionCookie = cookies
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));

    return sessionCookie?.slice(SESSION_COOKIE.length + 1);
  }
}
