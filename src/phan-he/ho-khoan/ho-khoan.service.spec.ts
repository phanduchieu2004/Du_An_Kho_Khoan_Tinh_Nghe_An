import type { EntityManager, Repository } from 'typeorm';
import * as XLSX from 'xlsx';

import { CatPhang } from '../cat-phang/thuc-the/cat-phang.entity.js';
import { CongTrinh } from '../cong-trinh/thuc-the/cong-trinh.entity.js';
import { GiaTriTrungBinhLop } from '../gia-tri-trung-binh-lop/thuc-the/gia-tri-trung-binh-lop.entity.js';
import { LopDat } from '../lop-dat/thuc-the/lop-dat.entity.js';
import { MauThiNghiem } from '../mau-thi-nghiem/thuc-the/mau-thi-nghiem.entity.js';
import { ThanhPhanHat } from '../thanh-phan-hat/thuc-the/thanh-phan-hat.entity.js';
import { HoKhoan } from './thuc-the/ho-khoan.entity.js';
import { HoKhoanService } from './ho-khoan.service.js';

describe('HoKhoanService Excel import', () => {
  it('imports each worksheet row into its related tables and updates records on re-import', async () => {
    const workbook = XLSX.utils.book_new();
    const data = Array.from({ length: 52 }, () => null);
    const sample = [...data];
    sample[0] = 1;
    sample[1] = 'HK1';
    sample[2] = 'D1';
    sample[3] = '1,5-2,0';
    sample[4] = 1;
    sample[5] = 1.2;
    sample[22] = 22.5;
    sample[37] = 0.15;
    sample[43] = "08º02'";
    sample[44] = 0.12;
    sample[45] = "25º30'";
    sample[51] = 'Cát hạt mịn';
    const average = [...data];
    average[0] = 'Giá trị trung bình lớp 1';
    average[37] = 0.14;
    average[51] = 'Cát hạt mịn';
    const sheet = XLSX.utils.aoa_to_sheet([
      ['BẢNG TỔNG HỢP'],
      ['Thứ tự', '\u00a0Hố khoan (mã)\u200b', 'Số hiệu mẫu', 'Độ sâu'],
      sample,
      average,
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Bảng tổng hợp');
    const buffer = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    );

    const records = new Map<Function, Array<Record<string, unknown>>>([
      [HoKhoan, []],
      [LopDat, []],
      [MauThiNghiem, []],
      [ThanhPhanHat, []],
      [CatPhang, []],
      [GiaTriTrungBinhLop, []],
    ]);
    let nextId = 1;
    const repositories = new Map<Function, {
      find: ReturnType<typeof vi.fn>;
      findOne: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      save: ReturnType<typeof vi.fn>;
    }>();

    for (const entity of records.keys()) {
      const table = records.get(entity)!;
      const saveOne = (record: Record<string, unknown>) => {
        const existingIndex = record.id
          ? table.findIndex((row) => row.id === record.id)
          : -1;
        const saved = { ...record, id: record.id ?? nextId++ };
        if (existingIndex >= 0) table[existingIndex] = saved;
        else table.push(saved);
        return saved;
      };
      repositories.set(entity, {
        find: vi.fn(async () => table),
        findOne: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          table.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null,
        ),
        create: vi.fn((record: Record<string, unknown>) => record),
        save: vi.fn(async (value: Record<string, unknown> | Record<string, unknown>[]) =>
          Array.isArray(value) ? value.map(saveOne) : saveOne(value),
        ),
      });
    }

    const manager = {
      getRepository: (entity: Function) => repositories.get(entity),
    };
    const projectRepository = {
      findOne: vi.fn().mockResolvedValue({ id: 7 }),
    };
    const holeRepository = {
      manager: {
        transaction: (callback: (transaction: EntityManager) => Promise<unknown>) =>
          callback(manager as unknown as EntityManager),
      },
      find: vi.fn(),
    };
    const service = new HoKhoanService(
      holeRepository as unknown as Repository<HoKhoan>,
      projectRepository as unknown as Repository<CongTrinh>,
    );

    service.validateWorkbook(buffer);
    const result = await service.importFromExcel(buffer, 7);
    expect(result).toMatchObject({
      created: 1,
      skipped: 0,
      importedSamples: 1,
      updatedSamples: 0,
      layers: 1,
      grainRecords: 1,
      cutRecords: 1,
      averageRecords: 1,
      holeNames: ['HK1'],
    });

    expect(records.get(MauThiNghiem)).toEqual([
      expect.objectContaining({
        ho_khoan_id: 1,
        lop_dat_id: 2,
        so_hieu_mau: 'D1',
        do_sau_tu: '1.5',
        do_sau_den: '2.0',
        do_am_tu_nhien_w: '22.5',
        goc_noi_ma_sat_phi: '8.033333',
        goc_nghi_kho_ak: '25.5',
      }),
    ]);
    expect(records.get(ThanhPhanHat)).toEqual([
      expect.objectContaining({ mau_id: 3, cuoi_dam_200_300: '1.2' }),
    ]);
    expect(records.get(CatPhang)).toEqual([
      expect.objectContaining({
        mau_id: 3,
        cap_ap_luc_025: '0.15',
        goc_noi_ma_sat_phi: '8.033333',
        luc_dinh_ket_c: '0.12',
      }),
    ]);
    expect(records.get(LopDat)).toEqual([
      expect.objectContaining({
        cong_trinh_id: 7,
        ten_lop: 'Lớp 1',
        mo_ta: 'Cát hạt mịn',
      }),
    ]);
    expect(records.get(GiaTriTrungBinhLop)).toEqual([
      expect.objectContaining({ lop_dat_id: 2, he_so_nen_lun_a: '0.14' }),
    ]);

    const repeated = await service.importFromExcel(buffer, 7);
    expect(repeated).toMatchObject({
      created: 0,
      skipped: 1,
      importedSamples: 0,
      updatedSamples: 1,
      layers: 1,
      grainRecords: 1,
      cutRecords: 1,
      averageRecords: 1,
    });
    expect(records.get(MauThiNghiem)).toHaveLength(1);
    expect(records.get(ThanhPhanHat)).toHaveLength(1);
    expect(records.get(CatPhang)).toHaveLength(1);
    expect(records.get(LopDat)).toHaveLength(1);
    expect(records.get(GiaTriTrungBinhLop)).toHaveLength(1);
  });
});

describe('HoKhoanService findAll', () => {
  it('filters boreholes by project when a project ID is provided', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const service = new HoKhoanService(
      { find } as unknown as Repository<HoKhoan>,
      {} as Repository<CongTrinh>,
    );

    await service.findAll(3);

    expect(find).toHaveBeenCalledWith({
      where: { cong_trinh_id: 3 },
    });
  });
});
