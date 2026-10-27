import {
  DEFAULT_PAGES_BY_PERMISSION,
  PERMISSION_MODES,
  SYSTEM_PAGES,
  SYSTEM_PERMISSIONS,
  UyQuyenService,
} from './uy-quyen.service.js';

describe('UyQuyenService', () => {
  const systemRepository = {
    findOneBy: vi.fn(),
    query: vi.fn(),
    save: vi.fn(),
  };
  const accountRepository = {
    findOneBy: vi.fn(),
    query: vi.fn(),
    save: vi.fn(),
  };
  let service: UyQuyenService;

  function permissionModes(
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    return Object.fromEntries([
      ...SYSTEM_PERMISSIONS.map(({ id }) => [id, 'cam']),
      ...Object.entries(overrides),
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    systemRepository.findOneBy.mockResolvedValue(null);
    systemRepository.query.mockResolvedValue([]);
    accountRepository.findOneBy.mockResolvedValue(null);
    accountRepository.query.mockResolvedValue([]);
    service = new UyQuyenService(
      systemRepository as never,
      accountRepository as never,
    );
  });

  it('creates and seeds the permission settings table idempotently', async () => {
    await service.onModuleInit();

    expect(systemRepository.query).toHaveBeenCalledTimes(2);
    expect(systemRepository.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT (id) DO NOTHING'),
      [SYSTEM_PERMISSIONS.map((permission) => permission.id)],
    );
    expect(accountRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS uy_quyen_tai_khoan'),
    );
    expect(accountRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS nut_theo_trang'),
    );
    expect(accountRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('ADD COLUMN IF NOT EXISTS che_do_quyen'),
    );
  });

  it('keeps every known permission enabled before a setting is created', async () => {
    await expect(service.getEnabledPermissionIds()).resolves.toEqual(
      SYSTEM_PERMISSIONS.map((permission) => permission.id),
    );
  });

  it('filters unknown IDs from stored permission configuration', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: ['cong-trinh', 'not-a-permission'],
    });

    await expect(service.getEnabledPermissionIds()).resolves.toEqual([
      'cong-trinh',
    ]);
  });

  it('saves unique selected permissions in the singleton setting', async () => {
    await service.setEnabledPermissionIds(['cong-trinh', 'cong-trinh']);

    expect(systemRepository.save).toHaveBeenCalledWith({
      id: 1,
      quyen_duoc_cap: ['cong-trinh'],
    });
  });

  it('rejects unknown permission IDs without saving', async () => {
    await expect(
      service.setEnabledPermissionIds(['not-a-permission']),
    ).rejects.toThrow('Danh sách quyền không hợp lệ.');
    expect(systemRepository.save).not.toHaveBeenCalled();
  });

  it('uses the per-account override when one exists', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: ['cong-trinh', 'ho-khoan'],
    });
    accountRepository.findOneBy.mockResolvedValue({
      ma_nguoi_dung: 15,
      quyen_duoc_cap: ['cong-trinh', 'vai-tro'],
    });

    await expect(
      service.getEnabledPermissionIdsForAccount(15),
    ).resolves.toEqual(['cong-trinh']);
  });

  it('falls back to shared defaults for accounts without an override', async () => {
    await expect(
      service.getEnabledPermissionIdsForAccount(15),
    ).resolves.toEqual(SYSTEM_PERMISSIONS.map((permission) => permission.id));
  });

  it('saves unique account permissions for only the selected account', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: ['cong-trinh'],
    });
    await service.setAccountPermissionModes(
      15,
      permissionModes({ 'cong-trinh': 'cap-quyen' }),
      { 'cong-trinh': ['ban-do', 'nguoi-dung'] },
    );

    expect(accountRepository.save).toHaveBeenCalledWith({
      ma_nguoi_dung: 15,
      quyen_duoc_cap: ['cong-trinh'],
      nut_theo_trang: { 'cong-trinh': ['ban-do', 'nguoi-dung'] },
      che_do_quyen: permissionModes({ 'cong-trinh': 'cap-quyen' }),
    });
  });

  it('rejects incomplete and unknown account permission modes', async () => {
    await expect(
      service.setAccountPermissionModes(15, { unknown: 'cap-quyen' }, {}),
    ).rejects.toThrow('Danh sách trạng thái quyền không hợp lệ.');
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('does not allow an account to receive a system-disabled permission', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: ['ho-khoan'],
    });
    await expect(
      service.setAccountPermissionModes(
        15,
        permissionModes({ 'cong-trinh': 'cap-quyen' }),
        {},
      ),
    ).rejects.toThrow('Không thể cấp quyền đang bị tắt ở cấp hệ thống.');
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('rejects placements for banned permissions or unknown pages', async () => {
    await expect(
      service.setAccountPermissionModes(
        15,
        permissionModes({ 'cong-trinh': 'cam' }),
        { 'ho-khoan': ['ban-do'] },
      ),
    ).rejects.toThrow('Danh sách trang hiển thị quyền không hợp lệ.');
    await expect(
      service.setAccountPermissionModes(
        15,
        permissionModes({ 'cong-trinh': 'cap-quyen' }),
        { 'cong-trinh': ['not-a-page'] },
      ),
    ).rejects.toThrow('Danh sách trang hiển thị quyền không hợp lệ.');
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('shows only granted buttons on their assigned pages', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: SYSTEM_PERMISSIONS.map((permission) => permission.id),
    });
    accountRepository.findOneBy.mockResolvedValue({
      ma_nguoi_dung: 15,
      quyen_duoc_cap: ['cong-trinh', 'ho-khoan'],
      nut_theo_trang: {
        'cong-trinh': ['ban-do'],
        'ho-khoan': ['nguoi-dung'],
      },
    });

    await expect(
      service.getButtonsForAccountOnPage(15, 'ban-do'),
    ).resolves.toEqual([
      { title: 'Danh sách công trình', path: '/cong-trinh/danh-sach' },
    ]);
    expect(service.getPageIdForPath('/')).toBe('ban-do');
    expect(service.getPageIdForPath('/vai-tro')).toBe('vai-tro');
    expect(service.getPageIdForPath('/vai-tro/')).toBe('vai-tro');
    expect(service.getPageIdForPath('/cong-trinh/sua-cho-duyet')).toBe(
      'duyet-sua-cong-trinh',
    );
    expect(
      service.getPageIdForPath('/cong-trinh/mat-bang-cap-2-cho-duyet'),
    ).toBe('duyet-mat-bang-cap-2');
    expect(
      service.getFeatureForRoute('/cong-trinh/mat-bang-cap-2-cho-duyet'),
    ).toMatchObject({ id: 'duyet-cong-trinh' });
    expect(
      service.getFeatureForRoute('/cong-trinh/mat-bang-cap-cho-duyet/4/12/duyet'),
    ).toMatchObject({ id: 'duyet-cong-trinh' });
    expect(
      service.getFeatureForRoute('/cong-trinh/gia-han-cho-duyet'),
    ).toBeUndefined();
    expect(
      service.getFeatureForRoute(
        '/cong-trinh/gia-han-cho-duyet/24/duyet',
      ),
    ).toBeUndefined();
    expect(
      service.getPageIdForPath('/cong-trinh/gia-han-cho-duyet'),
    ).toBe('duyet-gia-han-phan-cong');
    expect(SYSTEM_PAGES.length).toBeGreaterThan(0);
  });

  it('shows the selected shortcut when allow mode overrides a disabled global permission', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: [],
    });
    accountRepository.findOneBy.mockResolvedValue({
      ma_nguoi_dung: 15,
      quyen_duoc_cap: [],
      che_do_quyen: permissionModes({ 'cong-trinh': 'cho-phep' }),
      nut_theo_trang: { 'cong-trinh': ['ban-do'] },
    });

    await expect(
      service.getButtonsForAccountOnPage(15, 'ban-do'),
    ).resolves.toEqual([
      { title: 'Danh sách công trình', path: '/cong-trinh/danh-sach' },
    ]);
  });

  it('maps each permission to its existing default shortcut page', () => {
    expect(DEFAULT_PAGES_BY_PERMISSION['kham-pha-ban-do']).toEqual(['ban-do']);
    expect(DEFAULT_PAGES_BY_PERMISSION['gia-han-phan-cong']).toEqual([
      'duyet-gia-han-phan-cong',
    ]);
    expect(DEFAULT_PAGES_BY_PERMISSION['duyet-cong-trinh']).toEqual([
      'duyet-cong-trinh',
      'duyet-sua-cong-trinh',
      'duyet-mat-bang-cap-2',
    ]);
    expect(DEFAULT_PAGES_BY_PERMISSION['duyet-cong-trinh']).toContain(
      'duyet-sua-cong-trinh',
    );
    expect(DEFAULT_PAGES_BY_PERMISSION['duyet-cong-trinh']).toContain(
      'duyet-mat-bang-cap-2',
    );
    expect(DEFAULT_PAGES_BY_PERMISSION['tao-cong-trinh']).toEqual([
      'cong-trinh',
    ]);
  });

  it('applies all four permission modes to account route access', async () => {
    systemRepository.findOneBy.mockResolvedValue({
      id: 1,
      quyen_duoc_cap: ['cong-trinh'],
    });
    accountRepository.findOneBy.mockResolvedValue({
      ma_nguoi_dung: 15,
      quyen_duoc_cap: [],
      che_do_quyen: permissionModes({
        'cong-trinh': 'ngan-chan',
        'ho-khoan': 'cho-phep',
        'lop-dat': 'cam',
      }),
    });

    await expect(
      service.isAllowedForAccount('cong-trinh', 15, 'GET'),
    ).resolves.toBe(true);
    await expect(
      service.isAllowedForAccount(
        'cong-trinh',
        15,
        'POST',
        '/cong-trinh/them',
      ),
    ).resolves.toBe(false);
    await expect(
      service.isAllowedForAccount(
        'cong-trinh',
        15,
        'POST',
        '/cong-trinh/phan-bo/xem-truoc',
      ),
    ).resolves.toBe(true);
    await expect(
      service.isAllowedForAccount('ho-khoan', 15, 'POST'),
    ).resolves.toBe(true);
    await expect(
      service.isAllowedForAccount('lop-dat', 15, 'GET'),
    ).resolves.toBe(false);
    await expect(
      service.isAllowedForAccount('vai-tro', 15, 'GET'),
    ).resolves.toBe(false);
    expect(PERMISSION_MODES).toEqual([
      'cho-phep',
      'ngan-chan',
      'cam',
      'cap-quyen',
    ]);
  });

  it('maps application routes to their listed permission', () => {
    expect(service.getFeatureForRoute('/cong-trinh/phan-bo')).toMatchObject({
      id: 'phan-bo-cong-trinh',
    });
    expect(service.getFeatureForRoute('/cong-trinh/sua-cho-duyet')).toMatchObject({
      id: 'duyet-cong-trinh',
    });
    expect(service.getFeatureForRoute('/nguoi-dung/uy-quyen')).toBeUndefined();
  });
});
