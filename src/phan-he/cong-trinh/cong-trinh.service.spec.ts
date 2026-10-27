import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntityManager, Repository } from 'typeorm';
import * as XLSX from 'xlsx';

import { CongTrinh } from './thuc-the/cong-trinh.entity.js';
import { CongTrinhTaiLieu } from './thuc-the/cong-trinh-tai-lieu.entity.js';
import { CongTrinhService } from './cong-trinh.service.js';

describe('CongTrinhService project scope', () => {
  it('returns no projects when an engineer has no projects in the assigned area', async () => {
    const find = vi.fn();
    const service = new CongTrinhService(
      { find } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await expect(service.findAll([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('constrains project lists to the IDs found in the assigned boundary', async () => {
    const find = vi.fn(async () => []);
    const service = new CongTrinhService(
      { find } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.findAll([7, 8]);

    expect(find).toHaveBeenCalledOnce();
    const options = find.mock.calls[0]?.[0];
    expect(options?.where?.id).toMatchObject({
      _type: 'in',
      _value: [7, 8],
    });
    expect(options?.where?.da_duyet).toBe(true);
  });
});

describe('CongTrinhService project level filtering', () => {
  it('only returns projects that have a level-one survey area', async () => {
    const projects = [
      { id: 7, ten_cong_trinh: 'Công trình cấp 1' },
      { id: 8, ten_cong_trinh: 'Công trình cấp 2' },
    ] as CongTrinh[];
    const query = vi.fn(async () => [{ cong_trinh_id: 7 }]);
    const service = new CongTrinhService(
      {
        find: vi.fn(async () => projects),
        manager: { query },
      } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await expect(service.findProjectsWithLevelOneSurveyAreas()).resolves.toEqual([
      projects[0],
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("= '1'"), [
      [7, 8],
    ]);
  });
});

describe('CongTrinhService project approval', () => {
  it('finds created projects by engineer account, including pending projects', async () => {
    const createdProject = {
      id: 3,
      nguoi_tao: 17,
      da_duyet: false,
    } as CongTrinh;
    const find = vi.fn(async () => [createdProject]);
    const service = new CongTrinhService(
      { find } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await expect(service.findCreatedBy(17)).resolves.toEqual([createdProject]);
    expect(find).toHaveBeenCalledWith({
      where: { nguoi_tao: 17 },
      order: { ngay_tao: 'DESC', id: 'DESC' },
    });
  });

  it('returns pending projects and only counts projects awaiting approval', async () => {
    const pendingProject = { id: 3, da_duyet: false } as CongTrinh;
    const find = vi.fn(async () => [pendingProject]);
    const count = vi.fn(async () => 1);
    const service = new CongTrinhService(
      { find, count } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await expect(service.findPendingApproval()).resolves.toEqual([pendingProject]);
    await expect(service.countPendingApproval()).resolves.toBe(1);
    expect(find).toHaveBeenCalledWith({
      where: { da_duyet: false },
      order: { ngay_tao: 'DESC', id: 'DESC' },
    });
    expect(count).toHaveBeenCalledWith({ where: { da_duyet: false } });
  });

  it('approves only a project that is still pending', async () => {
    const update = vi.fn(async () => ({ affected: 1 }));
    const service = new CongTrinhService(
      { update } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.approveProject(3);

    expect(update).toHaveBeenCalledWith(
      { id: 3, da_duyet: false },
      expect.objectContaining({ da_duyet: true }),
    );
  });
});

describe('CongTrinhService project edit approval', () => {
  it('ensures the project approval schemas and level-two linkage exist at startup', async () => {
    const query = vi.fn(async () => []);
    const service = new CongTrinhService(
      { query } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.onModuleInit();

    expect(query).toHaveBeenCalledTimes(15);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('ADD COLUMN IF NOT EXISTS mat_bang_cap_1_id'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ADD COLUMN IF NOT EXISTS mat_bang_cha_id'),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET mat_bang_cha_id = mat_bang_cap_1_id'),
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('mat_bang_cap_1_id_fkey'),
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('mat_bang_cap_1_id_idx'),
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('mat_bang_mat_bang_cha_id_fkey'),
    );
    expect(query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining('mat_bang_mat_bang_cha_id_idx'),
    );
    expect(query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS cong_trinh_sua_doi'),
    );
    expect(query).toHaveBeenNthCalledWith(
      9,
      expect.stringContaining('cong_trinh_sua_doi_moi_cho_duyet'),
    );
    expect(query).toHaveBeenNthCalledWith(
      10,
      expect.stringContaining('cong_trinh_sua_doi_lich_su'),
    );
    expect(query).toHaveBeenNthCalledWith(
      11,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS mat_bang_cap_2_cho_duyet'),
    );
    expect(query).toHaveBeenNthCalledWith(
      12,
      expect.stringContaining('ADD COLUMN IF NOT EXISTS mat_bang_cha_id'),
    );
    expect(query).toHaveBeenNthCalledWith(
      13,
      expect.stringContaining('ADD COLUMN IF NOT EXISTS cap_mat_bang'),
    );
    expect(query).toHaveBeenNthCalledWith(
      14,
      expect.stringContaining('SET mat_bang_cha_id = mat_bang_cap_1_id'),
    );
    expect(query).toHaveBeenNthCalledWith(
      15,
      expect.stringContaining('mat_bang_cap_2_cho_duyet_trang_thai_idx'),
    );
  });

  it.each([2, 3, 4])(
    'stores a level-%s area request as pending without adding it to the project',
    async (level) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM cong_trinh')) return [{ id: 42 }];
      if (sql.includes('SELECT id') && sql.includes('FROM mat_bang')) {
        return [{ id: 5 }];
      }
      if (sql.includes('SELECT ST_Intersects')) return [{ intersects: true }];
      return [];
    });
    const manager = {
      query,
      getRepository: vi.fn(),
    };
    const service = new CongTrinhService(
      {
        manager: {
          transaction: (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        },
      } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.submitLevelSurveyRequest(
      42,
      5,
      level,
      {
        ten_mat_bang: `Mặt bằng cấp ${level}`,
        loai_mat_bang: 'Polygon',
        ranh_gioi: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[105, 18], [105.1, 18], [105.1, 18.1], [105, 18]]],
        }),
        ma_he_toa_do_nguon: 'WGS84',
      },
      'engineer01',
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mat_bang_cap_2_cho_duyet'),
      expect.arrayContaining([42, 5, 5, String(level), `Mặt bằng cấp ${level}`, 'engineer01']),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mat_bang ('),
      expect.anything(),
    );
  });

  it.each([2, 3, 4])(
    'adds a level-%s area to the project only when its request is approved',
    async (level) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM mat_bang_cap_2_cho_duyet')) {
        return [{
          id: 9,
          cong_trinh_id: 42,
          mat_bang_cap_1_id: 5,
          mat_bang_cha_id: 5,
          cap_mat_bang: level,
          ten_mat_bang: `Mặt bằng cấp ${level}`,
          loai_mat_bang: 'Polygon',
          ranh_gioi: {
            type: 'Polygon',
            coordinates: [[[105, 18], [105.1, 18], [105.1, 18.1], [105, 18]]],
          },
          ma_he_toa_do_nguon: 'WGS84',
        }];
      }
      if (sql.includes('FROM cong_trinh')) return [{ id: 42 }];
      if (sql.includes('SELECT id') && sql.includes('FROM mat_bang')) {
        return [{ id: 5 }];
      }
      if (sql.includes('SELECT ST_Intersects')) return [{ intersects: true }];
      return [];
    });
    const manager = {
      query,
      getRepository: vi.fn(),
    };
    const service = new CongTrinhService(
      {
        manager: {
          transaction: (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        },
      } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.approveLevelSurveyRequest(9, level, 'admin');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mat_bang ('),
      expect.arrayContaining([
        42,
        5,
        5,
        `Mặt bằng cấp ${level}`,
        'Polygon',
        String(level),
        'WGS84',
      ]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET trang_thai = 'da_duyet'"),
      ['admin', 9],
    );
  });

  it('loads pending survey requests using the JSONB boundary directly', async () => {
    const query = vi.fn(async () => []);
    const service = new CongTrinhService(
      { manager: { query } } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await expect(service.findPendingSurveyRequests()).resolves.toEqual([]);

    const [sql, parameters] = query.mock.calls[0] ?? [];
    expect(sql).toContain('request.ranh_gioi,');
    expect(sql).toContain('request.cap_mat_bang::integer AS cap_mat_bang');
    expect(sql).not.toContain('ST_AsGeoJSON(request.ranh_gioi)');
    expect(parameters).toEqual([null]);
  });

  it('stores a proposed edit without applying it to the current project', async () => {
    const project = {
      id: 42,
      ten_cong_trinh: 'Tên hiện tại',
      dia_diem: 'Địa điểm cũ',
      hang_muc: 'Khảo sát',
      ghi_chu: null,
    } as CongTrinh;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM mat_bang')) {
        return [{
          id: 5,
          ten_mat_bang: 'Mặt bằng cũ',
          loai_mat_bang: 'Polygon',
          cap_mat_bang: '1',
          ranh_gioi: { type: 'Polygon', coordinates: [] },
          ma_he_toa_do_nguon: 'WGS84',
          trang_thai: 'cho_xac_minh',
        }];
      }
      if (sql.includes('FROM cong_trinh_sua_doi')) return [];
      return [];
    });
    const save = vi.fn();
    const manager = {
      query,
      getRepository: () => ({
        findOne: vi.fn(async () => project),
        save,
      }),
    };
    const service = new CongTrinhService(
      {
        manager: {
          transaction: (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        },
      } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.submitProjectEdit(
      42,
      {
        ten_cong_trinh: 'Tên đề xuất',
        dia_diem: 'Địa điểm mới',
        hang_muc: 'Khảo sát',
        ghi_chu: null,
      },
      [{
        id: 5,
        ten_mat_bang: 'Mặt bằng mới',
        loai_mat_bang: 'Polygon',
        cap_mat_bang: '1',
        ranh_gioi: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[105, 18], [105.1, 18], [105.1, 18.1], [105, 18]]],
        }),
        ma_he_toa_do_nguon: 'WGS84',
        trang_thai: 'cho_xac_minh',
      }],
      'engineer01',
    );

    expect(save).not.toHaveBeenCalled();
    const insertCall = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO cong_trinh_sua_doi'),
    );
    expect(insertCall).toBeDefined();
    expect(JSON.parse(String(insertCall?.[1]?.[1])).project.ten_cong_trinh)
      .toBe('Tên hiện tại');
    expect(JSON.parse(String(insertCall?.[1]?.[2])).project.ten_cong_trinh)
      .toBe('Tên đề xuất');
  });

  it('applies a submitted project edit only when an administrator approves it', async () => {
    const project = { id: 42, ten_cong_trinh: 'Tên hiện tại' } as CongTrinh;
    const proposed = {
      project: {
        ten_cong_trinh: 'Tên đã duyệt',
        dia_diem: 'Địa điểm mới',
        hang_muc: 'Khảo sát',
        ghi_chu: null,
      },
      surveys: [{
        id: 5,
        ten_mat_bang: 'Mặt bằng đã duyệt',
        loai_mat_bang: 'Polygon',
        cap_mat_bang: '1',
        ranh_gioi: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[105, 18], [105.1, 18], [105.1, 18.1], [105, 18]]],
        }),
        ma_he_toa_do_nguon: 'WGS84',
        trang_thai: 'cho_xac_minh',
      }],
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM cong_trinh_sua_doi')) {
        return [{
          id: 12,
          cong_trinh_id: 42,
          du_lieu_de_xuat: proposed,
        }];
      }
      if (sql.includes('SELECT id FROM mat_bang')) return [{ id: 5 }];
      return [];
    });
    const save = vi.fn(async (value) => value);
    const manager = {
      query,
      getRepository: () => ({
        findOne: vi.fn(async () => project),
        save,
      }),
    };
    const service = new CongTrinhService(
      {
        manager: {
          transaction: (callback: (value: typeof manager) => Promise<void>) =>
            callback(manager),
        },
      } as unknown as Repository<CongTrinh>,
      {} as Repository<CongTrinhTaiLieu>,
    );

    await service.approveProjectEdit(12, 'admin');

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 42, ten_cong_trinh: 'Tên đã duyệt' }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE mat_bang'),
      expect.arrayContaining(['Mặt bằng đã duyệt', 5, 42]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET trang_thai = 'da_duyet'"),
      ['admin', 12],
    );
  });
});

describe('CongTrinhService project details', () => {
  it('exports the same combined and level-two tables shown on the detail page', async () => {
    const project = {
      id: 42,
      ten_cong_trinh: 'Công trình thử',
      ngay_tao: new Date('2026-10-20T09:03:00.000Z'),
    } as CongTrinh;
    const service = new CongTrinhService(
      {
        findOne: vi.fn(async () => project),
        manager: { query: vi.fn(async () => []) },
      } as unknown as Repository<CongTrinh>,
      {
        find: vi.fn(async () => []),
      } as unknown as Repository<CongTrinhTaiLieu>,
    );

    const workbookBytes = await service.exportProjectWorkbook(42);
    const workbook = XLSX.read(workbookBytes, { type: 'buffer' });

    expect(workbook.SheetNames).toEqual([
      'Mặt bằng cấp 1',
      'Mặt bằng cấp 2',
      'Bảng tổng hợp hố khoan',
    ]);
    for (const sheetName of workbook.SheetNames.slice(0, 2)) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(
        workbook.Sheets[sheetName]!,
        { header: 1 },
      );
      expect(rows[0]?.length, `${sheetName} should include column headers`).toBeGreaterThan(0);
      expect(rows).toHaveLength(1);
    }
    const templateSheet = workbook.Sheets['Bảng tổng hợp hố khoan']!;
    expect(templateSheet['A2']?.v).toBe('CÔNG TRÌNH:  Công trình thử');
    expect(templateSheet['A3']?.v).toBe('ĐỊA ĐIỂM:  ');
    expect(templateSheet['A4']?.v).toBe('HẠNG MỤC:  ');
    expect(templateSheet['!merges']).toHaveLength(54);
    expect(templateSheet['A9']?.v).toBeUndefined();
    expect(templateSheet['B9']?.v).toBeUndefined();
  });

  it('collects full table rows and separates level-two survey areas', async () => {
    const project = { id: 42, ten_cong_trinh: 'Công trình thử' } as CongTrinh;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM ho_khoan')) {
        return [{
          id: 5,
          cong_trinh_id: 42,
          ma_ho_khoan: 'HK1',
          cot_bo_sung: 'Hố khoan bổ sung',
        }];
      }
      if (sql.includes('FROM lop_dat')) {
        return [{ id: 8, cong_trinh_id: 42, cot_bo_sung: 'Lớp đất bổ sung' }];
      }
      if (sql.includes('FROM mau_thi_nghiem')) {
        return [{
          id: 11,
          ho_khoan_id: 5,
          lop_dat_id: 8,
          stt: 1,
          so_hieu_mau: 'M1',
          do_sau_tu: '1.5',
          do_sau_den: '2.0',
          so_thi_nghiem: 2,
          do_am_tu_nhien_w: 18.5,
          mo_dun_bien_dang_e12: 321,
          cot_bo_sung: 'Mẫu bổ sung',
        }];
      }
      if (sql.includes('FROM mat_bang')) {
        return [
          {
            id: 2,
            cap_mat_bang: '1',
            ten_mat_bang: 'Mặt bằng cấp 1',
            boundary_json: { type: 'Polygon' },
            cot_bo_sung: 'Cột cấp 1 bổ sung',
          },
          {
            id: 3,
            cap_mat_bang: '2',
            ten_mat_bang: 'Mặt bằng cấp 2',
            boundary_json: { type: 'Polygon' },
            mat_bang_cap_1: 'Mặt bằng cấp 1',
            cot_bo_sung: 'Cột cấp 2 bổ sung',
          },
          {
            id: 4,
            cap_mat_bang: null,
            ten_mat_bang: 'Mặt bằng chưa phân cấp',
            boundary_json: null,
          },
        ];
      }
      if (sql.includes('FROM thanh_phan_hat')) {
        return [
          {
            id: 12,
            mau_id: 11,
            cuoi_dam_200_300: 12.5,
            soi_150_200: 23.5,
          },
        ];
      }
      if (sql.includes('FROM cat_phang')) {
        return [{ id: 13, mau_id: 11, cap_ap_luc_025: 45.5 }];
      }
      if (sql.includes('FROM gia_tri_trung_binh_lop')) {
        return [{ id: 14, lop_dat_id: 8 }];
      }
      if (sql.includes('FROM cong_trinh_tai_lieu')) {
        return [{ id: 15, ten_file: 'bao-cao.pdf' }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const projectRepository = {
      findOne: vi.fn(async () => project),
      manager: { query },
    };
    const documentRepository = {
      find: vi.fn(async () => [{ id: 15, ten_file: 'bao-cao.pdf' }]),
    };
    const service = new CongTrinhService(
      projectRepository as unknown as Repository<CongTrinh>,
      documentRepository as unknown as Repository<CongTrinhTaiLieu>,
    );

    const details = await service.findProjectDetails(42);

    expect(details.project).toBe(project);
    expect(details.sections.map(({ title, rows }) => [title, rows.length])).toEqual([
      ['Thông tin công trình', 1],
      ['Mặt bằng', 3],
      ['Hố khoan', 1],
      ['Lớp đất', 1],
      ['Mẫu thí nghiệm', 1],
      ['Thành phần hạt', 1],
      ['Cắt phẳng', 1],
      ['Giá trị trung bình lớp', 1],
      ['Tài liệu công trình', 1],
    ]);
    expect(details.detailSections.map(({ title, rows }) => [title, rows.length])).toEqual([
      ['Thông tin công trình', 1],
      ['Mặt bằng cấp 1', 1],
      ['Mặt bằng cấp 2', 1],
      ['Mặt bằng cấp 3', 0],
      ['Mặt bằng cấp 4', 0],
      ['Mặt bằng chưa phân cấp', 1],
      ['Hố khoan', 1],
      ['Lớp đất', 1],
      ['Mẫu thí nghiệm', 1],
      ['Thành phần hạt', 1],
      ['Cắt phẳng', 1],
      ['Giá trị trung bình lớp', 1],
      ['Tài liệu công trình', 1],
    ]);
    expect(details.detailSections.find(({ title }) => title === 'Hố khoan')?.rows[0])
      .toHaveProperty('cot_bo_sung', 'Hố khoan bổ sung');
    expect(details.detailSections.find(({ title }) => title === 'Mặt bằng cấp 2')?.rows[0])
      .toHaveProperty('mat_bang_cap_1', 'Mặt bằng cấp 1');
    expect(details.excelColumns).toHaveLength(52);
    expect(details.excelColumns).toContain('Hố khoan');
    expect(details.excelColumns).toContain('Số hiệu mẫu');
    expect(details.excelRows[0]?.length).toBe(52);
    expect(details.excelRows[0]?.slice(0, 5)).toEqual([
      1,
      'HK1',
      'M1',
      '1.5-2.0',
      2,
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE ho_khoan_id = ANY'),
      [[5], [8]],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT *\n       FROM mau_thi_nghiem'),
      [[5], [8]],
    );

    const workbook = XLSX.read(await service.exportProjectWorkbook(42), { type: 'buffer' });
    expect(workbook.SheetNames).toEqual([
      'Mặt bằng cấp 1',
      'Mặt bằng cấp 2',
      'Bảng tổng hợp hố khoan',
    ]);
    const levelTwoRows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets['Mặt bằng cấp 2']!,
      { header: 1 },
    );
    expect(levelTwoRows[0]).toContain('Thuộc mặt bằng cấp 1');
    expect(levelTwoRows).toHaveLength(2);
    const templateSheet = workbook.Sheets['Bảng tổng hợp hố khoan']!;
    expect(templateSheet['A9']?.v).toBe(1);
    expect(templateSheet['B9']?.v).toBe('HK1');
    expect(templateSheet['C9']?.v).toBe('M1');
    expect(templateSheet['D9']?.v).toBe('1.5-2.0');
    expect(templateSheet['F9']?.v).toBe(12.5);
    expect(templateSheet['G9']?.v).toBe(23.5);
    expect(templateSheet['W9']?.v).toBe(18.5);
    expect(templateSheet['AL9']?.v).toBe(45.5);
    expect(templateSheet['AQ9']?.v).toBe(321);
    expect(templateSheet['!merges']).toHaveLength(54);

    const levelTwoWorkbook = XLSX.read(
      await service.exportProjectDetailTable(42, 'mat-bang-cap-2'),
      { type: 'buffer' },
    );
    expect(levelTwoWorkbook.SheetNames).toEqual(['Mặt bằng cấp 2']);
    const levelTwoExportRows = XLSX.utils.sheet_to_json<unknown[]>(
      levelTwoWorkbook.Sheets['Mặt bằng cấp 2']!,
      { header: 1 },
    );
    expect(levelTwoExportRows[0]).toContain('Thuộc mặt bằng cấp 1');
    expect(levelTwoExportRows[1]).toContain('Mặt bằng cấp 2');

    const boreholeWorkbook = XLSX.read(
      await service.exportProjectDetailTable(42, 'bang-ho-khoan'),
      { type: 'buffer', cellStyles: true },
    );
    expect(boreholeWorkbook.SheetNames).toEqual(['Bảng tổng hợp hố khoan']);
    const exportedTemplate = boreholeWorkbook.Sheets['Bảng tổng hợp hố khoan']!;
    expect(exportedTemplate['A2']?.v).toBe('CÔNG TRÌNH:  Công trình thử');
    expect(exportedTemplate['A9']?.v).toBe(1);
    expect(exportedTemplate['B9']?.v).toBe('HK1');
    expect(exportedTemplate['C9']?.v).toBe('M1');
    expect(exportedTemplate['D9']?.v).toBe('1.5-2.0');
    expect(exportedTemplate['F9']?.v).toBe(12.5);
    expect(exportedTemplate['G9']?.v).toBe(23.5);
    expect(exportedTemplate['W9']?.v).toBe(18.5);
    expect(exportedTemplate['AL9']?.v).toBe(45.5);
    expect(exportedTemplate['AQ9']?.v).toBe(321);
    expect(exportedTemplate['!merges']).toHaveLength(54);
    expect(exportedTemplate['A9']?.s).toBeDefined();
  });
});

describe('CongTrinhService project attachments', () => {
  it('stores uploaded files under their project and returns them for download', async () => {
    const projectId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const projectRepository = {
      create: vi.fn((project: Partial<CongTrinh>) => project),
      save: vi.fn(async (project: Partial<CongTrinh>) => ({
        ...project,
        id: projectId,
      })),
    };
    let savedDocument: Partial<CongTrinhTaiLieu> | undefined;
    const documentRepository = {
      create: vi.fn((document: Partial<CongTrinhTaiLieu>) => document),
      save: vi.fn(async (documents: Partial<CongTrinhTaiLieu>[]) => {
        savedDocument = { ...documents[0], id: 1 };
        return [savedDocument];
      }),
      findOne: vi.fn(async () => savedDocument as CongTrinhTaiLieu),
    };
    const query = vi.fn(async () => []);
    const manager = {
      getRepository: (entity: Function) =>
        entity === CongTrinh ? projectRepository : documentRepository,
      query,
    };
    projectRepository['manager'] = {
      transaction: (callback: (transaction: EntityManager) => Promise<unknown>) =>
        callback(manager as unknown as EntityManager),
    };
    const service = new CongTrinhService(
      projectRepository as unknown as Repository<CongTrinh>,
      documentRepository as unknown as Repository<CongTrinhTaiLieu>,
    );
    const contents = Buffer.from('project drawing');
    const directory = join(
      process.cwd(),
      'uploads',
      'cong-trinh',
      String(projectId),
    );

    try {
      const survey = {
        ten_mat_bang: 'Mặt bằng thử',
        loai_mat_bang: 'Polygon',
        cap_mat_bang: '1',
        ranh_gioi: JSON.stringify({
          type: 'Polygon',
          coordinates: [[[105, 18], [105.1, 18], [105.1, 18.1], [105, 18.1], [105, 18]]],
        }),
        ma_he_toa_do_nguon: 'WGS84',
        trang_thai: 'da_xac_minh',
      };
      await service.create(
        { ten_cong_trinh: 'Công trình thử', hang_muc: 'Thiết kế đường' },
        'Báo cáo thiết kế',
        [{
          originalname: 'ban-ve.pdf',
          mimetype: 'application/pdf',
          size: contents.length,
          buffer: contents,
        }],
        survey,
      );

      expect(projectRepository.create).toHaveBeenCalledWith({
        ten_cong_trinh: 'Công trình thử',
        hang_muc: 'Thiết kế đường',
        da_duyet: false,
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('ST_GeomFromGeoJSON');
      expect(query.mock.calls[0][0]).toContain('cap_mat_bang');
      expect(query.mock.calls[0][1]).toEqual([
        projectId,
        'Mặt bằng thử',
        'Polygon',
        survey.ranh_gioi,
        'WGS84',
        'da_xac_minh',
        '1',
      ]);
      expect(savedDocument).toMatchObject({
        cong_trinh_id: projectId,
        loai_tai_lieu: 'Báo cáo thiết kế',
        ten_file: 'ban-ve.pdf',
      });

      const download = await service.findDocumentForDownload(projectId, 1);
      expect(await readFile(download.path)).toEqual(contents);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
