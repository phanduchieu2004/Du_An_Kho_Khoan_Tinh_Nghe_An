import {
  BadRequestException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { UyQuyenHeThong } from './thuc-the/uy-quyen-he-thong.entity.js';
import { UyQuyenTaiKhoan } from './thuc-the/uy-quyen-tai-khoan.entity.js';

export const SYSTEM_PERMISSIONS = [
  {
    id: 'kham-pha-ban-do',
    title: 'Khám phá bản đồ',
    button: 'Tìm kiếm / Vị trí / Quét bản đồ',
  },
  {
    id: 'cong-trinh',
    title: 'Quản lý công trình',
    button: 'Danh sách công trình',
  },
  { id: 'tao-cong-trinh', title: 'Tạo công trình', button: 'Tạo dự án mới' },
  {
    id: 'duyet-cong-trinh',
    title: 'Duyệt công trình',
    button: 'Duyệt công trình',
  },
  {
    id: 'phan-bo-cong-trinh',
    title: 'Phân bổ công trình',
    button: 'Phân bổ',
  },
  {
    id: 'huy-phan-cong',
    title: 'Quản lý yêu cầu hủy phân công',
    button: 'Duyệt hủy phân công',
  },
  {
    id: 'gia-han-phan-cong',
    title: 'Quản lý yêu cầu gia hạn phân công',
    button: 'Duyệt gia hạn',
  },
  { id: 'ho-khoan', title: 'Quản lý hố khoan', button: 'Hố khoan' },
  { id: 'lop-dat', title: 'Quản lý lớp đất', button: 'Lớp đất' },
  {
    id: 'mau-thi-nghiem',
    title: 'Quản lý mẫu thí nghiệm',
    button: 'Mẫu thí nghiệm',
  },
  {
    id: 'thanh-phan-hat',
    title: 'Quản lý thành phần hạt',
    button: 'Thành phần hạt',
  },
  { id: 'cat-phang', title: 'Quản lý cắt phẳng', button: 'Cắt phẳng' },
  {
    id: 'gia-tri-trung-binh-lop',
    title: 'Quản lý giá trị trung bình lớp',
    button: 'Giá trị trung bình lớp',
  },
  { id: 'mat-bang', title: 'Quản lý mặt bằng', button: 'Mặt bằng' },
  { id: 'nguoi-dung', title: 'Quản lý người dùng', button: 'Người dùng' },
  { id: 'vai-tro', title: 'Quản lý vai trò', button: 'Vai trò' },
  {
    id: 'quan-ly-khu-vuc',
    title: 'Quản lý khu vực',
    button: 'Quản lý khu vực',
  },
  {
    id: 'xuat-du-lieu',
    title: 'Xuất dữ liệu',
    button: 'Xuất file tổng hợp',
  },
  {
    id: 'thao-tac-ban-ghi',
    title: 'Thao tác bản ghi',
    button: 'Sửa / xóa bản ghi',
  },
  { id: 'tai-len', title: 'Tải dữ liệu lên', button: 'Tải lên' },
] as const;

export type SystemPermissionId = (typeof SYSTEM_PERMISSIONS)[number]['id'];

export const PERMISSION_MODES = [
  'cho-phep',
  'ngan-chan',
  'cam',
  'cap-quyen',
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const SYSTEM_PAGES = [
  { id: 'ban-do', title: 'Bản đồ', path: '/' },
  {
    id: 'cong-trinh',
    title: 'Danh sách công trình',
    path: '/cong-trinh/danh-sach',
  },
  {
    id: 'duyet-cong-trinh',
    title: 'Duyệt công trình',
    path: '/cong-trinh/cho-duyet',
  },
  {
    id: 'duyet-sua-cong-trinh',
    title: 'Duyệt sửa công trình',
    path: '/cong-trinh/sua-cho-duyet',
  },
  {
    id: 'duyet-mat-bang-cap-2',
    title: 'Duyệt mặt bằng cấp 2, 3, 4',
    path: '/cong-trinh/mat-bang-cap-2-cho-duyet',
  },
  {
    id: 'phan-bo-cong-trinh',
    title: 'Phân bổ công trình',
    path: '/cong-trinh/phan-bo',
  },
  {
    id: 'don-huy-phan-cong',
    title: 'Đơn hủy phân công',
    path: '/cong-trinh/yeu-cau-huy/quan-tri',
  },
  {
    id: 'duyet-gia-han-phan-cong',
    title: 'Duyệt gia hạn phân công',
    path: '/cong-trinh/gia-han-cho-duyet',
  },
  { id: 'ho-khoan', title: 'Hố khoan', path: '/ho-khoan' },
  { id: 'lop-dat', title: 'Lớp đất', path: '/lop-dat' },
  {
    id: 'mau-thi-nghiem',
    title: 'Mẫu thí nghiệm',
    path: '/mau-thi-nghiem',
  },
  {
    id: 'thanh-phan-hat',
    title: 'Thành phần hạt',
    path: '/thanh-phan-hat',
  },
  { id: 'cat-phang', title: 'Cắt phẳng', path: '/cat-phang' },
  {
    id: 'gia-tri-trung-binh-lop',
    title: 'Giá trị trung bình lớp',
    path: '/gia-tri-trung-binh-lop',
  },
  { id: 'mat-bang', title: 'Mặt bằng', path: '/mat-bang/danh-sach' },
  { id: 'nguoi-dung', title: 'Quản lý tài khoản', path: '/nguoi-dung' },
  { id: 'vai-tro', title: 'Vai trò', path: '/vai-tro' },
] as const;

export type SystemPageId = (typeof SYSTEM_PAGES)[number]['id'];

export const DEFAULT_PAGES_BY_PERMISSION: Record<
  SystemPermissionId,
  SystemPageId[]
> = {
  'kham-pha-ban-do': ['ban-do'],
  'cong-trinh': ['cong-trinh'],
  'tao-cong-trinh': ['cong-trinh'],
  'duyet-cong-trinh': [
    'duyet-cong-trinh',
    'duyet-sua-cong-trinh',
    'duyet-mat-bang-cap-2',
  ],
  'phan-bo-cong-trinh': ['phan-bo-cong-trinh'],
  'huy-phan-cong': ['don-huy-phan-cong'],
  'gia-han-phan-cong': ['duyet-gia-han-phan-cong'],
  'ho-khoan': ['ho-khoan'],
  'lop-dat': ['lop-dat'],
  'mau-thi-nghiem': ['mau-thi-nghiem'],
  'thanh-phan-hat': ['thanh-phan-hat'],
  'cat-phang': ['cat-phang'],
  'gia-tri-trung-binh-lop': ['gia-tri-trung-binh-lop'],
  'mat-bang': ['mat-bang'],
  'nguoi-dung': ['nguoi-dung'],
  'vai-tro': ['vai-tro'],
  'quan-ly-khu-vuc': [],
  'xuat-du-lieu': [],
  'thao-tac-ban-ghi': ['cong-trinh'],
  'tai-len': ['cong-trinh'],
};

export interface PermissionPageButton {
  title: string;
  path: string;
}

@Injectable()
export class UyQuyenService implements OnModuleInit {
  constructor(
    @InjectRepository(UyQuyenHeThong)
    private readonly systemRepository: Repository<UyQuyenHeThong>,
    @InjectRepository(UyQuyenTaiKhoan)
    private readonly accountRepository: Repository<UyQuyenTaiKhoan>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.systemRepository.query(`
      CREATE TABLE IF NOT EXISTS uy_quyen_he_thong (
        id smallint PRIMARY KEY CHECK (id = 1),
        quyen_duoc_cap text[] NOT NULL
      )
    `);
    await this.systemRepository.query(
      `
        INSERT INTO uy_quyen_he_thong (id, quyen_duoc_cap)
        VALUES (1, $1::text[])
        ON CONFLICT (id) DO NOTHING
      `,
      [SYSTEM_PERMISSIONS.map((permission) => permission.id)],
    );
    await this.accountRepository.query(`
      CREATE TABLE IF NOT EXISTS uy_quyen_tai_khoan (
        ma_nguoi_dung integer PRIMARY KEY,
        quyen_duoc_cap text[] NOT NULL,
        nut_theo_trang jsonb NOT NULL DEFAULT '{}'::jsonb,
        che_do_quyen jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await this.accountRepository.query(`
      ALTER TABLE uy_quyen_tai_khoan
      ADD COLUMN IF NOT EXISTS nut_theo_trang jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    await this.accountRepository.query(`
      ALTER TABLE uy_quyen_tai_khoan
      ADD COLUMN IF NOT EXISTS che_do_quyen jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
  }

  async getEnabledPermissionIds(): Promise<SystemPermissionId[]> {
    const settings = await this.systemRepository.findOneBy({ id: 1 });
    if (!settings) {
      return SYSTEM_PERMISSIONS.map((permission) => permission.id);
    }
    return settings.quyen_duoc_cap.filter((id): id is SystemPermissionId =>
      SYSTEM_PERMISSIONS.some((permission) => permission.id === id),
    );
  }

  async setEnabledPermissionIds(ids: string[]): Promise<void> {
    const knownIds = new Set<string>(
      SYSTEM_PERMISSIONS.map((permission) => permission.id),
    );
    if (ids.some((id) => !knownIds.has(id))) {
      throw new BadRequestException('Danh sách quyền không hợp lệ.');
    }

    await this.systemRepository.save({
      id: 1,
      quyen_duoc_cap: [...new Set(ids)],
    });
  }

  async getAccountPermissionOverride(
    accountId: number,
  ): Promise<SystemPermissionId[] | null> {
    const settings = await this.accountRepository.findOneBy({
      ma_nguoi_dung: accountId,
    });
    if (!settings) return null;
    return this.filterKnownPermissionIds(settings.quyen_duoc_cap);
  }

  async getAccountPagePlacements(
    accountId: number,
  ): Promise<Record<string, string[]>> {
    const settings = await this.accountRepository.findOneBy({
      ma_nguoi_dung: accountId,
    });
    const rawPlacements = settings?.nut_theo_trang;
    if (
      !rawPlacements ||
      typeof rawPlacements !== 'object' ||
      Array.isArray(rawPlacements)
    ) {
      return {};
    }

    const validPageIds = new Set<string>(
      SYSTEM_PAGES.map((page) => page.id),
    );
    const validPermissionIds = new Set<string>(
      SYSTEM_PERMISSIONS.map((permission) => permission.id),
    );
    return Object.fromEntries(
      Object.entries(rawPlacements)
        .filter(
          ([permissionId, pageIds]) =>
            validPermissionIds.has(permissionId) && Array.isArray(pageIds),
        )
        .map(([permissionId, pageIds]) => [
          permissionId,
          pageIds.filter(
            (pageId): pageId is string =>
              typeof pageId === 'string' && validPageIds.has(pageId),
          ),
        ]),
    );
  }

  async getEnabledPermissionIdsForAccount(
    accountId: number,
  ): Promise<SystemPermissionId[]> {
    const modes = await this.getAccountPermissionModes(accountId);
    const globalPermissions = await this.getEnabledPermissionIds();
    return SYSTEM_PERMISSIONS.filter((permission) =>
      this.isModeAllowed(
        modes[permission.id],
        globalPermissions.includes(permission.id),
        'GET',
      ),
    ).map((permission) => permission.id);
  }

  async getAccountPermissionModes(
    accountId: number,
  ): Promise<Record<SystemPermissionId, PermissionMode>> {
    const [settings, globalPermissionIds] = await Promise.all([
      this.accountRepository.findOneBy({ ma_nguoi_dung: accountId }),
      this.getEnabledPermissionIds(),
    ]);
    const knownModes = new Set<string>(PERMISSION_MODES);
    const storedModes = settings?.che_do_quyen;

    return Object.fromEntries(
      SYSTEM_PERMISSIONS.map((permission) => {
        const storedMode = storedModes?.[permission.id];
        if (typeof storedMode === 'string' && knownModes.has(storedMode)) {
          if (
            storedMode === 'cap-quyen' &&
            !globalPermissionIds.includes(permission.id)
          ) {
            return [permission.id, 'cam'];
          }
          return [permission.id, storedMode];
        }

        const hadLegacyGrant = settings
          ? settings.quyen_duoc_cap.includes(permission.id)
          : globalPermissionIds.includes(permission.id);
        return [permission.id, hadLegacyGrant ? 'cap-quyen' : 'cam'];
      }),
    ) as Record<SystemPermissionId, PermissionMode>;
  }

  async setAccountPermissionModes(
    accountId: number,
    modes: Record<string, string>,
    pagePlacements: Record<string, string[]>,
  ): Promise<void> {
    const permissionIds = new Set<string>(
      SYSTEM_PERMISSIONS.map(({ id }) => id),
    );
    const modeIds = Object.keys(modes);
    if (
      modeIds.length !== permissionIds.size ||
      modeIds.some(
        (id) =>
          !permissionIds.has(id) ||
          !PERMISSION_MODES.includes(modes[id] as PermissionMode),
      )
    ) {
      throw new BadRequestException('Danh sách trạng thái quyền không hợp lệ.');
    }
    const globalPermissions = await this.getEnabledPermissionIds();
    if (
      Object.entries(modes).some(
        ([id, mode]) =>
          mode === 'cap-quyen' &&
          !globalPermissions.includes(id as SystemPermissionId),
      )
    ) {
      throw new BadRequestException(
        'Không thể cấp quyền đang bị tắt ở cấp hệ thống.',
      );
    }

    const visiblePermissionIds = new Set(
      Object.entries(modes)
        .filter(([, mode]) => mode !== 'cam')
        .map(([id]) => id),
    );
    const validPageIds = new Set<string>(
      SYSTEM_PAGES.map((page) => page.id),
    );
    for (const [permissionId, pageIds] of Object.entries(pagePlacements)) {
      if (
        (!visiblePermissionIds.has(permissionId) && pageIds.length > 0) ||
        !permissionIds.has(permissionId) ||
        pageIds.some((pageId) => !validPageIds.has(pageId))
      ) {
        throw new BadRequestException(
          'Danh sách trang hiển thị quyền không hợp lệ.',
        );
      }
    }

    await this.accountRepository.save({
      ma_nguoi_dung: accountId,
      quyen_duoc_cap: Object.entries(modes)
        .filter(([, mode]) => mode === 'cap-quyen')
        .map(([id]) => id),
      nut_theo_trang: Object.fromEntries(
        Object.entries(pagePlacements).map(([permissionId, pageIds]) => [
          permissionId,
          [...new Set(pageIds)],
        ]),
      ),
      che_do_quyen: modes,
    });
  }

  getPageIdForPath(path: string): SystemPageId | undefined {
    const normalizedPath =
      path.length > 1 ? path.replace(/\/+$/, '') : path;
    if (normalizedPath === '/') return 'ban-do';
    const page = SYSTEM_PAGES.find(
      (candidate) =>
        candidate.path !== '/' && normalizedPath === candidate.path,
    );
    return page?.id;
  }

  async getButtonsForAccountOnPage(
    accountId: number,
    pageId: SystemPageId | undefined,
  ): Promise<PermissionPageButton[]> {
    if (!pageId) return [];

    const [modes, globalPermissionIds, placements] =
      await Promise.all([
        this.getAccountPermissionModes(accountId),
        this.getEnabledPermissionIds(),
        this.getAccountPagePlacements(accountId),
      ]);

    return SYSTEM_PERMISSIONS.filter(
      (permission) =>
        this.isModeAllowed(
          modes[permission.id],
          globalPermissionIds.includes(permission.id),
          'GET',
        ) &&
        placements[permission.id]?.includes(pageId),
    ).map((permission) => ({
      title: permission.button,
      path: this.getDestinationForPermission(permission.id),
    }));
  }

  private getDestinationForPermission(
    permissionId: SystemPermissionId,
  ): string {
    const destinations: Record<SystemPermissionId, string> = {
      'kham-pha-ban-do': '/',
      'cong-trinh': '/cong-trinh/danh-sach',
      'tao-cong-trinh': '/cong-trinh/them',
      'duyet-cong-trinh': '/cong-trinh/cho-duyet',
      'phan-bo-cong-trinh': '/cong-trinh/phan-bo',
      'huy-phan-cong': '/cong-trinh/yeu-cau-huy/quan-tri',
      'gia-han-phan-cong': '/cong-trinh/gia-han-cho-duyet',
      'ho-khoan': '/ho-khoan',
      'lop-dat': '/lop-dat',
      'mau-thi-nghiem': '/mau-thi-nghiem',
      'thanh-phan-hat': '/thanh-phan-hat',
      'cat-phang': '/cat-phang',
      'gia-tri-trung-binh-lop': '/gia-tri-trung-binh-lop',
      'mat-bang': '/mat-bang/danh-sach',
      'nguoi-dung': '/nguoi-dung',
      'vai-tro': '/vai-tro',
      'quan-ly-khu-vuc': '/quan-ly-khu-vuc',
      'xuat-du-lieu': '/xuat-file/tong-hop',
      'thao-tac-ban-ghi': '/cong-trinh/danh-sach',
      'tai-len': '/cong-trinh/them',
    };
    return destinations[permissionId];
  }

  getFeatureForRoute(
    path: string,
  ): (typeof SYSTEM_PERMISSIONS)[number] | undefined {
    const startsWithPath = (prefix: string) =>
      path === prefix || path.startsWith(`${prefix}/`);

    if (startsWithPath('/nguoi-dung/uy-quyen')) return undefined;
    if (startsWithPath('/nguoi-dung/ho-so')) return undefined;
    if (path === '/nguoi-dung/khu-vuc-phan-cong') return undefined;

    if (startsWithPath('/cong-trinh/cho-duyet')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'duyet-cong-trinh');
    }
    if (startsWithPath('/cong-trinh/sua-cho-duyet')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'duyet-cong-trinh');
    }
    if (startsWithPath('/cong-trinh/mat-bang-cap-2-cho-duyet')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'duyet-cong-trinh');
    }
    if (startsWithPath('/cong-trinh/mat-bang-cap-cho-duyet')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'duyet-cong-trinh');
    }
    if (startsWithPath('/cong-trinh/phan-bo')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'phan-bo-cong-trinh');
    }
    if (startsWithPath('/cong-trinh/yeu-cau-huy')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'huy-phan-cong');
    }
    if (startsWithPath('/cong-trinh/gia-han-cho-duyet')) {
      return undefined;
    }
    if (startsWithPath('/cong-trinh/them')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'tao-cong-trinh');
    }
    if (startsWithPath('/cong-trinh')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'cong-trinh');
    }

    const permissionByPrefix: Array<[string, SystemPermissionId]> = [
      ['/ho-khoan', 'ho-khoan'],
      ['/lop-dat', 'lop-dat'],
      ['/mau-thi-nghiem', 'mau-thi-nghiem'],
      ['/thanh-phan-hat', 'thanh-phan-hat'],
      ['/cat-phang', 'cat-phang'],
      ['/gia-tri-trung-binh-lop', 'gia-tri-trung-binh-lop'],
      ['/mat-bang', 'mat-bang'],
      ['/vai-tro', 'vai-tro'],
      ['/quan-ly-khu-vuc', 'quan-ly-khu-vuc'],
      ['/xuat-file', 'xuat-du-lieu'],
      ['/records', 'thao-tac-ban-ghi'],
      ['/upload', 'tai-len'],
    ];
    const matched = permissionByPrefix.find(([prefix]) =>
      startsWithPath(prefix),
    );
    if (matched) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === matched[1]);
    }

    if (startsWithPath('/nguoi-dung')) {
      return SYSTEM_PERMISSIONS.find((item) => item.id === 'nguoi-dung');
    }

    return undefined;
  }

  async isEnabled(id: SystemPermissionId): Promise<boolean> {
    const enabledIds = await this.getEnabledPermissionIds();
    return enabledIds.includes(id);
  }

  async isEnabledForAccount(
    id: SystemPermissionId,
    accountId: number,
  ): Promise<boolean> {
    return this.isAllowedForAccount(id, accountId, 'GET');
  }

  async isAllowedForAccount(
    id: SystemPermissionId,
    accountId: number,
    method: string,
    path = '',
  ): Promise<boolean> {
    const [modes, globalPermissions] = await Promise.all([
      this.getAccountPermissionModes(accountId),
      this.getEnabledPermissionIds(),
    ]);
    return this.isModeAllowed(
      modes[id],
      globalPermissions.includes(id),
      method,
      path,
    );
  }

  private isModeAllowed(
    mode: PermissionMode,
    globallyEnabled: boolean,
    method: string,
    path = '',
  ): boolean {
    if (mode === 'cho-phep') return true;
    if (mode === 'ngan-chan') {
      return (
        method === 'GET' ||
        method === 'HEAD' ||
        (method === 'POST' &&
          (path === '/cong-trinh/phan-bo/xem-truoc' ||
            path === '/xuat-file/trang-hien-tai'))
      );
    }
    return mode === 'cap-quyen' && globallyEnabled;
  }

  private filterKnownPermissionIds(ids: string[]): SystemPermissionId[] {
    return ids.filter((id): id is SystemPermissionId =>
      SYSTEM_PERMISSIONS.some((permission) => permission.id === id),
    );
  }

  getPermissionForRequest(request: Pick<Request, 'method' | 'path'>) {
    return this.getFeatureForRoute(request.path);
  }
}
