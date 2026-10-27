import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { DataExportService } from './xuat-du-lieu.service.js';

describe('DataExportService', () => {
  it('exports only the supplied rows and columns from the current page', () => {
    const service = new DataExportService({} as DataSource);

    const workbook = XLSX.read(
      service.exportCurrentPage({
        headers: ['Mã', 'Tên công trình'],
        rows: [
          ['1', 'Dự án A'],
          ['2', 'Dự án B'],
        ],
      }),
      { type: 'buffer' },
    );
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Dữ liệu trang']!, {
      header: 1,
    });

    expect(workbook.SheetNames).toEqual(['Dữ liệu trang']);
    expect(rows).toEqual([
      ['Mã', 'Tên công trình'],
      ['1', 'Dự án A'],
      ['2', 'Dự án B'],
    ]);
  });

  it('rejects current-page rows that do not match the selected columns', () => {
    const service = new DataExportService({} as DataSource);

    expect(() =>
      service.exportCurrentPage({
        headers: ['Mã', 'Tên'],
        rows: [['1']],
      }),
    ).toThrow('Danh sách hàng cần xuất không hợp lệ.');
  });

  it('exports every application table and omits hidden password columns', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('"nguoi_dung"')) {
        return [{ ma_nguoi_dung: 1, ten_dang_nhap: 'admin' }];
      }

      return [];
    });
    const dataSource = {
      entityMetadatas: [
        {
          tableName: 'nguoi_dung',
          schema: 'public',
          columns: [
            {
              databaseName: 'ma_nguoi_dung',
              type: 'integer',
              isSelect: true,
            },
            { databaseName: 'ten_dang_nhap', type: 'varchar', isSelect: true },
            { databaseName: 'mat_khau', type: 'varchar', isSelect: false },
          ],
        },
      ],
      driver: { escape: (name: string) => `"${name}"` },
      query,
    } as unknown as DataSource;
    const service = new DataExportService(dataSource);

    const workbook = XLSX.read(await service.exportWorkbook(), {
      type: 'buffer',
    });

    expect(workbook.SheetNames).toEqual([
      'Mặt bằng',
      'Người dùng',
      'Tổng hợp',
    ]);
    expect(query).toHaveBeenCalledWith(
      'SELECT "ma_nguoi_dung" AS "ma_nguoi_dung", "ten_dang_nhap" AS "ten_dang_nhap" FROM "public"."nguoi_dung"',
    );
    const userRows = XLSX.utils.sheet_to_json(
      workbook.Sheets['Người dùng']!,
      { header: 1 },
    );
    expect(userRows).toEqual([['ma_nguoi_dung', 'ten_dang_nhap'], [1, 'admin']]);
    expect(workbook.Sheets['Mặt bằng']).toBeDefined();
  });
});
