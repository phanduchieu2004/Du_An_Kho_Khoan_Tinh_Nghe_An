import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { And, ArrayContains, Not } from 'typeorm';
import { NguoiDung } from './thuc-the/nguoi-dung.entity.js';
import { NguoiDungService } from './nguoi-dung.service.js';

describe('NguoiDungService authentication', () => {
  let service: NguoiDungService;
  let repository: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOneBy: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    manager: {
      query: ReturnType<typeof vi.fn>;
      transaction: ReturnType<typeof vi.fn>;
    };
  };
  let queryBuilder: {
    addSelect: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    queryBuilder = {
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn(),
    };
    repository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      create: vi.fn((account) => account),
      save: vi.fn((account) => Promise.resolve(account)),
      remove: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
      manager: {
        query: vi.fn().mockResolvedValue([]),
        transaction: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NguoiDungService,
        {
          provide: getRepositoryToken(NguoiDung),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get(NguoiDungService);
  });

  it('shows administrator accounts only in the administrator list', async () => {
    await service.findAll('quan-tri-vien');

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cong_vai_tro: ArrayContains(['quan-tri-vien']) },
      }),
    );
  });

  it('excludes administrator accounts from other portal lists', async () => {
    await service.findAll('ky-su');

    const where = repository.find.mock.calls[0][0].where;
    expect(where.cong_vai_tro).toEqual(
      And(ArrayContains(['ky-su']), Not(ArrayContains(['quan-tri-vien']))),
    );
  });

  it('approves an account without changing its other fields', async () => {
    const account = {
      ma_nguoi_dung: 17,
      ten_dang_nhap: 'engineer01',
      trang_thai: 'CHO_DUYET',
      duoc_dang_nhap: true,
    };
    repository.findOneBy.mockResolvedValue(account);

    await service.approveAccount(17);

    expect(account.trang_thai).toBe('DA_DUYET');
    expect(repository.save).toHaveBeenCalledWith(account);
    expect(account.duoc_dang_nhap).toBe(true);
  });

  it('reports a missing account when approving', async () => {
    repository.findOneBy.mockResolvedValue(null);

    await expect(service.approveAccount(17)).rejects.toThrow(
      'Không tìm thấy tài khoản.',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('lists every account assigned to a portal for authorization', async () => {
    await service.findAllForPortal('ky-su');

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cong_vai_tro: ArrayContains(['ky-su']) },
      }),
    );
  });

  it('ensures the allocation status column exists at startup', async () => {
    await service.onModuleInit();

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ADD COLUMN IF NOT EXISTS trang_thai_phan_bo TEXT NOT NULL DEFAULT 'da_phan_bo'",
      ),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong_huy',
      ),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_huy_cho_duyet',
      ),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong_gia_han',
      ),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_gia_han_cho_duyet',
      ),
    );
  });

  it('returns only assignments active today and merges their region geometry', async () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [105, 18],
          [106, 18],
          [106, 19],
          [105, 19],
          [105, 18],
        ],
      ],
    };
    repository.manager.query.mockResolvedValueOnce([
      {
        has_assignments: true,
        active_project_ids: [12, 15],
        active_geometries: [geometry],
        active_area_names: ['Phường A'],
        active_latitude: '18.5',
        active_longitude: '105.5',
      },
    ]);

    await expect(service.findProjectAssignmentAccess(7)).resolves.toEqual({
      hasAssignments: true,
      activeProjectIds: [12, 15],
      activeAreaName: 'Phường A',
      activeGeometry: geometry,
      activeLatitude: 18.5,
      activeLongitude: 105.5,
    });
    const assignmentAccessQuery = String(
      repository.manager.query.mock.calls[0][0],
    );
    expect(assignmentAccessQuery).toContain('WHERE dang_hieu_luc');
    expect(assignmentAccessQuery).not.toContain('CURRENT_TIMESTAMP');
    expect(assignmentAccessQuery).not.toContain('tu_ngay <=');
    expect(assignmentAccessQuery).not.toContain('den_ngay >=');
  });

  it('shows allocation status in engineer summaries', async () => {
    repository.manager.query.mockResolvedValueOnce([
      {
        ma_nguoi_dung: 7,
        assigned_count: '1',
        allocated_count: '1',
        completed_count: '0',
      },
      {
        ma_nguoi_dung: 8,
        assigned_count: '0',
        allocated_count: '0',
        completed_count: '0',
      },
    ]);

    await expect(service.findEngineerAllocationSummaries()).resolves.toEqual([
      expect.objectContaining({
        ma_nguoi_dung: 7,
        allocation_status: 'da_phan_bo',
        allocated_count: 1,
      }),
      expect.objectContaining({
        ma_nguoi_dung: 8,
        allocation_status: 'chua_phan_bo',
        allocated_count: 0,
      }),
    ]);
    expect(repository.manager.query.mock.calls[0][0]).toContain(
      "a.trang_thai_phan_bo = 'da_phan_bo'",
    );
  });

  it('loads current project owners and classifies overdue and pending cancellation allocations', async () => {
    repository.manager.query.mockResolvedValueOnce([]);

    await service.findProjectAllocationStatuses();

    const query = String(repository.manager.query.mock.calls[0][0]);
    expect(query).toContain('DISTINCT ON (a.cong_trinh_id)');
    expect(query).toContain("WHEN cancellation.trang_thai = 'cho_duyet' THEN 'pending_cancellation'");
    expect(query).toContain("THEN 'overdue'");
    expect(query).toContain("a.trang_thai_phan_bo = 'da_phan_bo'");
    expect(query).toContain("cancellation.trang_thai IS DISTINCT FROM 'da_duyet'");
  });

  it('returns only the signed-in engineer cancellation requests awaiting approval', async () => {
    repository.manager.query.mockResolvedValueOnce([
      { id: 3, cong_trinh_id: 21, trang_thai: 'cho_duyet' },
    ]);

    await expect(
      service.findMyPendingEngineerCancellationRequests(8),
    ).resolves.toEqual([{ id: 3, cong_trinh_id: 21, trang_thai: 'cho_duyet' }]);
    expect(repository.manager.query).toHaveBeenCalledWith(
      expect.stringContaining("r.trang_thai = 'cho_duyet'"),
      [8],
    );
  });

  it('stores the allocated status when assigning a project', async () => {
    const manager = {
      findOne: vi.fn().mockResolvedValue({
        ma_nguoi_dung: 7,
        cong_vai_tro: ['ky-su'],
        duoc_dang_nhap: true,
      }),
      save: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([]),
    };
    repository.manager.transaction.mockImplementation(async (callback) =>
      callback(manager as never),
    );

    await service.assignEngineerAreaFromProjects(
      7,
      'Khu vực A',
      { type: 'Polygon', coordinates: [] },
      18,
      105,
      [
        {
          projectId: 12,
          startDate: '2026-10-27',
          endDate: '2026-12-31',
          areaName: 'Khu vực A',
          geometry: { type: 'Polygon', coordinates: [] },
          latitude: 18,
          longitude: 105,
        },
      ],
    );

    expect(manager.query.mock.calls[1][0]).toContain('trang_thai_phan_bo');
    expect(manager.query.mock.calls[1][0]).toContain("'da_phan_bo'");
  });

  it('allows administrators to assign the area manager portal', async () => {
    await service.createAccount({
      ten_dang_nhap: 'manager01',
      ho_ten: 'Area Manager',
      email: null,
      dia_chi: null,
      so_dien_thoai: null,
      ma_ky_su: null,
      chuyen_nganh: null,
      don_vi_cong_tac: null,
      so_chung_chi_hanh_nghe: null,
      trang_thai: 'DA_DUYET',
      khu_vuc_duoc_xem: 'Khu vực mẫu',
      khu_vuc_phan_cong_ranh_gioi: null,
      khu_vuc_phan_cong_vi_do: null,
      khu_vuc_phan_cong_kinh_do: null,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      cong_vai_tro: ['quan-ly-khu-vuc'],
      duoc_dang_nhap: true,
      mat_khau: 'password123',
    });

    expect(repository.create.mock.calls[0][0].cong_vai_tro).toEqual([
      'quan-ly-khu-vuc',
    ]);
  });

  it('updates only profile fields for a staff account within manager bounds', async () => {
    const account = {
      ma_nguoi_dung: 9,
      cong_vai_tro: ['ky-su'],
      khu_vuc_phan_cong_vi_do: 11,
      khu_vuc_phan_cong_kinh_do: 102,
      khu_vuc_phan_cong_ranh_gioi: { type: 'Polygon', coordinates: [] },
    };
    repository.findOneBy
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(null);

    await service.updateAreaManagedAccount(
      9,
      {
        ho_ten: 'Kỹ sư mới',
        email: null,
        dia_chi: null,
        so_dien_thoai: null,
        ma_ky_su: null,
        chuyen_nganh: null,
        don_vi_cong_tac: null,
        so_chung_chi_hanh_nghe: null,
        trang_thai: 'DA_DUYET',
        duoc_dang_nhap: true,
      },
      { south: 10, north: 12, west: 101, east: 103 },
    );

    expect(account).toMatchObject({
      ho_ten: 'Kỹ sư mới',
      cong_vai_tro: ['ky-su'],
      khu_vuc_phan_cong_vi_do: 11,
      khu_vuc_phan_cong_kinh_do: 102,
    });
    expect(repository.save).toHaveBeenCalledWith(account);
  });

  it('rejects manager updates to accounts outside assigned bounds', async () => {
    repository.findOneBy.mockResolvedValue({
      ma_nguoi_dung: 9,
      cong_vai_tro: ['ky-su'],
      khu_vuc_phan_cong_vi_do: 20,
      khu_vuc_phan_cong_kinh_do: 105,
    });

    await expect(
      service.deleteAreaManagedAccount(9, {
        south: 10,
        north: 12,
        west: 101,
        east: 103,
      }),
    ).rejects.toThrow('Không tìm thấy tài khoản trong khu vực.');
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('verifies a legacy password and upgrades it to a scrypt hash', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ma_nguoi_dung: 1,
      mat_khau: 'secret',
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
    });

    await expect(
      service.verifyCredentials('kysu01', 'secret', 'ky-su'),
    ).resolves.toBe(true);

    const [, update] = repository.update.mock.calls[0];
    expect(update.mat_khau).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
    expect(update.mat_khau).not.toBe('secret');
  });

  it('rejects an incorrect password without changing the stored value', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ma_nguoi_dung: 1,
      mat_khau: 'secret',
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
    });

    await expect(
      service.verifyCredentials('kysu01', 'incorrect', 'ky-su'),
    ).resolves.toBe(false);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('verifies an existing scrypt password hash', async () => {
    const salt = randomBytes(16);
    const hash = scryptSync('secret', salt, 64).toString('base64url');
    queryBuilder.getOne.mockResolvedValue({
      ma_nguoi_dung: 1,
      mat_khau: `scrypt$${salt.toString('base64url')}$${hash}`,
      cong_vai_tro: ['ky-su'],
      duoc_dang_nhap: true,
    });

    await expect(
      service.verifyCredentials('kysu01', 'secret', 'ky-su'),
    ).resolves.toBe(true);
    expect(repository.update).toHaveBeenCalledWith(1, {
      lan_dang_nhap_cuoi: expect.any(Date),
    });
  });

  it('rejects accounts assigned to another portal', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ma_nguoi_dung: 1,
      mat_khau: 'secret',
      cong_vai_tro: ['nguoi-xem-ban-do'],
      duoc_dang_nhap: true,
    });

    await expect(
      service.verifyCredentials('viewer', 'secret', 'nguoi-xem-ban-do'),
    ).resolves.toBe(true);
  });

  it('rejects disabled accounts even with the correct portal assignment', async () => {
    queryBuilder.getOne.mockResolvedValue({
      ma_nguoi_dung: 1,
      mat_khau: 'secret',
      cong_vai_tro: ['nguoi-xem-ban-do'],
      duoc_dang_nhap: false,
    });

    await expect(
      service.verifyCredentials('viewer', 'secret', 'nguoi-xem-ban-do'),
    ).resolves.toBe(false);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('registers an enabled engineer account with only the engineer portal', async () => {
    await service.registerAccount(
      'engineer01',
      'Engineer One',
      'password123',
      'ky-su',
      {
        email: 'engineer@example.com',
        dia_chi: 'Hà Nội',
        so_dien_thoai: '0900000000',
        ma_ky_su: 'KS-01',
        chuyen_nganh: 'Địa chất',
        don_vi_cong_tac: 'Đơn vị A',
        so_chung_chi_hanh_nghe: 'CC-01',
      },
    );

    const [account] = repository.create.mock.calls[0];
    expect(account.ten_dang_nhap).toBe('engineer01');
    expect(account.ho_ten).toBe('Engineer One');
    expect(account).toMatchObject({
      email: 'engineer@example.com',
      dia_chi: 'Hà Nội',
      so_dien_thoai: '0900000000',
      ma_ky_su: 'KS-01',
      chuyen_nganh: 'Địa chất',
      don_vi_cong_tac: 'Đơn vị A',
      so_chung_chi_hanh_nghe: 'CC-01',
      trang_thai: 'CHO_DUYET',
    });
    expect(account.cong_vai_tro).toEqual(['ky-su']);
    expect(account.duoc_dang_nhap).toBe(true);
    expect(account.mat_khau).toMatch(/^scrypt\$[^$]+\$[^$]+$/);
  });

  it('rejects administrator self-registration', async () => {
    await expect(
      service.registerAccount(
        'newadmin',
        'New Admin',
        'password123',
        'quan-tri-vien',
      ),
    ).rejects.toThrow('Cổng đăng ký không hợp lệ.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects an already-used username during registration', async () => {
    repository.findOneBy.mockResolvedValue({ ma_nguoi_dung: 1 });

    await expect(
      service.registerAccount(
        'engineer01',
        'Engineer One',
        'password123',
        'ky-su',
      ),
    ).rejects.toThrow('Tên đăng nhập đã tồn tại.');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('stores an avatar on disk without persisting its path in the database', async () => {
    const userId = Date.now();
    const directory = join(
      process.cwd(),
      'uploads',
      'nguoi-dung',
      String(userId),
    );
    const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    try {
      await service.saveAvatar(userId, {
        buffer: pngHeader,
        mimetype: 'image/png',
      });
      const avatarPath = await service.findAvatarPath(userId);

      expect(avatarPath).toBe(join(directory, 'avatar.png'));
      await expect(readFile(avatarPath!)).resolves.toEqual(pngHeader);
      expect(repository.save).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects uploaded files that are not valid supported image types', async () => {
    await expect(
      service.saveAvatar(987654321, {
        buffer: Buffer.from('<script>alert(1)</script>'),
        mimetype: 'image/png',
      }),
    ).rejects.toThrow('Ảnh không hợp lệ.');
  });
});
