import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './bao-ve-xac-thuc.guard.js';

describe('AuthGuard', () => {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(false),
  };
  const sessions = {
    verify: vi.fn().mockReturnValue(null),
  };
  const users = {
    findAccess: vi.fn().mockResolvedValue({
      ma_nguoi_dung: 12,
      cong_vai_tro: ['ky-su', 'quan-tri-vien', 'nguoi-xem-ban-do'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      hasProjectAssignments: false,
      hasActiveProjectAssignments: false,
    }),
  };
  const permissions = {
    getPermissionForRequest: vi.fn().mockReturnValue(undefined),
    isAllowedForAccount: vi.fn().mockResolvedValue(true),
  };
  let guard: AuthGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    sessions.verify.mockReturnValue(null);
    users.findAccess.mockResolvedValue({
      ma_nguoi_dung: 12,
      cong_vai_tro: ['ky-su', 'quan-tri-vien', 'nguoi-xem-ban-do'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      hasProjectAssignments: false,
      hasActiveProjectAssignments: false,
    });
    permissions.getPermissionForRequest.mockReturnValue(undefined);
    permissions.isAllowedForAccount.mockResolvedValue(true);
    guard = new AuthGuard(
      reflector as never,
      sessions as never,
      users as never,
      permissions as never,
    );
  });

  function contextFor(method: string, path: string): ExecutionContext {
    const request = { method, path, headers: {} };
    const response = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      clearCookie: vi.fn(),
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: vi.fn(),
      getClass: vi.fn(),
    } as unknown as ExecutionContext;
  }

  it('allows the login portal route without a session', async () => {
    await expect(
      guard.canActivate(contextFor('GET', '/dang-nhap')),
    ).resolves.toBe(true);
  });

  it('allows the public base map route without a session', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(contextFor('GET', '/'))).resolves.toBe(true);
  });

  it('allows role login forms without a session', async () => {
    await expect(
      guard.canActivate(contextFor('POST', '/dang-nhap/quan-tri-vien')),
    ).resolves.toBe(true);
  });

  it('redirects unauthenticated requests to protected pages', async () => {
    const context = contextFor('GET', '/cong-trinh');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.redirect).toHaveBeenCalledWith('/dang-nhap');
  });

  it('returns an authentication response for protected map APIs', async () => {
    const context = contextFor('GET', '/ho-khoan/api');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Vui lòng đăng nhập để tiếp tục.',
    });
  });

  it('requires an engineer or administrator for data-management pages', async () => {
    sessions.verify.mockReturnValue({
      username: 'nguoixem01',
      role: 'nguoi-xem-ban-do',
      expiresAt: Date.now() / 1000 + 60,
    });
    const context = contextFor('GET', '/cong-trinh');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.redirect).toHaveBeenCalledWith('/dang-nhap/ky-su');
  });

  it('allows the map viewer to read map overlay APIs', async () => {
    sessions.verify.mockReturnValue({
      username: 'nguoixem01',
      role: 'nguoi-xem-ban-do',
      expiresAt: Date.now() / 1000 + 60,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/ho-khoan/api')),
    ).resolves.toBe(true);
  });

  it('allows only administrators to open user-management pages', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    const context = contextFor('GET', '/nguoi-dung');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.redirect).toHaveBeenCalledWith('/dang-nhap/quan-tri-vien');
  });

  it('blocks a system-wide disabled feature on its server route', async () => {
    sessions.verify.mockReturnValue({
      username: 'admin',
      role: 'quan-tri-vien',
      expiresAt: Date.now() / 1000 + 60,
    });
    permissions.getPermissionForRequest.mockReturnValue({
      id: 'cong-trinh',
      title: 'Quản lý công trình',
    });
    permissions.isAllowedForAccount.mockResolvedValue(false);
    const context = contextFor('GET', '/cong-trinh');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(
      'Chức năng "Quản lý công trình" hiện chưa được ủy quyền.',
    );
    expect(permissions.isAllowedForAccount).toHaveBeenCalledWith(
      'cong-trinh',
      12,
      'GET',
      '/cong-trinh',
    );
  });

  it('allows read-only access but blocks writes in prevent mode', async () => {
    sessions.verify.mockReturnValue({
      username: 'admin',
      role: 'quan-tri-vien',
      expiresAt: Date.now() / 1000 + 60,
    });
    permissions.getPermissionForRequest.mockReturnValue({
      id: 'cong-trinh',
      title: 'Quản lý công trình',
    });
    permissions.isAllowedForAccount.mockImplementation(
      (
        _id: string,
        _accountId: number,
        method: string,
        _path: string,
      ) =>
        Promise.resolve(method === 'GET'),
    );

    await expect(
      guard.canActivate(contextFor('GET', '/cong-trinh')),
    ).resolves.toBe(true);
    const context = contextFor('POST', '/cong-trinh/them');
    const response = context.switchToHttp().getResponse();
    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it('allows engineers to open their personal profile and avatar routes', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    await expect(
      guard.canActivate(contextFor('GET', '/nguoi-dung/ho-so')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('POST', '/nguoi-dung/ho-so/anh')),
    ).resolves.toBe(true);
  });

  it('allows engineers and area managers to open the shared support inbox', async () => {
    sessions.verify.mockReturnValue({
      username: 'manager01',
      role: 'quan-ly-khu-vuc',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      ma_nguoi_dung: 12,
      cong_vai_tro: ['quan-ly-khu-vuc'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      hasProjectAssignments: false,
      hasActiveProjectAssignments: false,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/ho-tro')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('POST', '/ho-tro/12/tra-loi')),
    ).resolves.toBe(true);
  });

  it('allows the shared support roles to load account avatars', async () => {
    sessions.verify.mockReturnValue({
      username: 'engineer01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/nguoi-dung/12/anh')),
    ).resolves.toBe(true);
  });

  it('allows area managers only into their own management portal', async () => {
    sessions.verify.mockReturnValue({
      username: 'manager01',
      role: 'quan-ly-khu-vuc',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['quan-ly-khu-vuc'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/quan-ly-khu-vuc')),
    ).resolves.toBe(true);
    const response = contextFor('GET', '/cong-trinh');
    const responseWriter = response.switchToHttp().getResponse();
    await expect(guard.canActivate(response)).resolves.toBe(false);
    expect(responseWriter.redirect).toHaveBeenCalledWith('/dang-nhap/ky-su');
  });

  it('allows engineers to request their assigned map area bounds', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/nguoi-dung/khu-vuc-phan-cong')),
    ).resolves.toBe(true);
  });

  it('blocks project access after the assignment period expires', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: '2020-01-01',
      khu_vuc_phan_cong_den_ngay: '2020-01-31',
    });
    const context = contextFor('GET', '/cong-trinh/12');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(
      'Khu vực phân công chưa có hiệu lực hoặc đã hết hạn.',
    );
  });

  it('blocks project data APIs before the assignment starts', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });

    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: '2999-01-01',
      khu_vuc_phan_cong_den_ngay: '2999-01-31',
    });
    const context = contextFor('GET', '/ho-khoan/api');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Khu vực phân công chưa có hiệu lực hoặc đã hết hạn.',
    });
  });

  it('blocks assigned project routes when every per-project period is inactive', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      hasProjectAssignments: true,
      hasActiveProjectAssignments: false,
    });
    const context = contextFor('GET', '/cong-trinh/12');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(
      'Khu vực phân công chưa có hiệu lực hoặc đã hết hạn.',
    );
  });

  it('allows assigned project routes when at least one per-project period is active', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      hasProjectAssignments: true,
      hasActiveProjectAssignments: true,
    });

    await expect(
      guard.canActivate(contextFor('GET', '/cong-trinh/12')),
    ).resolves.toBe(true);
  });

  it('allows profile access when the assignment period is not active', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
      khu_vuc_phan_cong_tu_ngay: '2999-01-01',
      khu_vuc_phan_cong_den_ngay: '2999-01-31',
    });

    await expect(
      guard.canActivate(contextFor('GET', '/nguoi-dung/ho-so')),
    ).resolves.toBe(true);
  });

  it('allows map viewers to open and update their own profile', async () => {
    sessions.verify.mockReturnValue({
      username: 'viewer01',
      role: 'nguoi-xem-ban-do',
      expiresAt: Date.now() / 1000 + 60,
    });
    await expect(
      guard.canActivate(contextFor('GET', '/nguoi-dung/ho-so')),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor('POST', '/nguoi-dung/ho-so/anh')),
    ).resolves.toBe(true);
  });

  it('invalidates sessions when the assigned portal is removed', async () => {
    sessions.verify.mockReturnValue({
      username: 'kysu01',
      role: 'ky-su',
      expiresAt: Date.now() / 1000 + 60,
    });
    users.findAccess.mockResolvedValue({
      cong_vai_tro: ['nguoi-xem-ban-do'],
      duoc_dang_nhap: true,
    });
    const context = contextFor('GET', '/cong-trinh');
    const response = context.switchToHttp().getResponse();

    await expect(guard.canActivate(context)).resolves.toBe(false);
    expect(response.clearCookie).toHaveBeenCalledWith('hk_session', {
      path: '/',
    });
    expect(response.redirect).toHaveBeenCalledWith('/dang-nhap');
  });
});
