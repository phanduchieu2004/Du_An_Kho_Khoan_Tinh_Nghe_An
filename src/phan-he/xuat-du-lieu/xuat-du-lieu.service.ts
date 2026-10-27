import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as XLSX from 'xlsx';
import { DataSource } from 'typeorm';

interface ExportColumn {
  databaseName: string;
  type: string | Function;
  isSelect: boolean;
}

interface ExportTable {
  tableName: string;
  schema?: string;
  columns: ExportColumn[];
}

export interface CurrentPageExport {
  headers: string[];
  rows: string[][];
}

const HIDDEN_COLUMNS = new Set(['mat_khau']);

const TABLE_LABELS: Record<string, string> = {
  cat_phang: 'Cắt phẳng',
  cong_trinh: 'Công trình',
  cong_trinh_tai_lieu: 'Tài liệu công trình',
  gia_tri_trung_binh_lop: 'Giá trị TB lớp',
  ho_khoan: 'Hố khoan',
  lop_dat: 'Lớp đất',
  mat_bang: 'Mặt bằng',
  mau_thi_nghiem: 'Mẫu thí nghiệm',
  nguoi_dung: 'Người dùng',
  thanh_phan_hat: 'Thành phần hạt',
  vai_tro: 'Vai trò',
};

@Injectable()
export class DataExportService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async exportWorkbook(): Promise<Buffer> {
    const tables = this.getTables();
    const workbook = XLSX.utils.book_new();
    const summary: Array<Array<string | number>> = [
      ['Bảng dữ liệu', 'Số bản ghi'],
    ];

    for (const table of tables) {
      const columns = table.columns.filter(
        (column) =>
          column.isSelect &&
          !HIDDEN_COLUMNS.has(column.databaseName.toLowerCase()),
      );
      const headers = columns.map((column) => column.databaseName);
      const selectedColumns = columns.map((column) => {
        const escapedName = this.dataSource.driver.escape(column.databaseName);
        const expression =
          column.type === 'geometry' || column.type === 'geography'
            ? `ST_AsGeoJSON(${escapedName})`
            : escapedName;

        return `${expression} AS ${escapedName}`;
      });
      const tablePath = [table.schema, table.tableName]
        .filter((part): part is string => Boolean(part))
        .map((part) => this.dataSource.driver.escape(part))
        .join('.');
      const rows = (await this.dataSource.query(
        `SELECT ${selectedColumns.join(', ')} FROM ${tablePath}`,
      )) as Array<Record<string, unknown>>;

      const worksheet = XLSX.utils.aoa_to_sheet([
        headers,
        ...rows.map((row) => headers.map((header) => this.toCellValue(row[header]))),
      ]);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        TABLE_LABELS[table.tableName] ?? table.tableName.slice(0, 31),
      );
      summary.push([
        TABLE_LABELS[table.tableName] ?? table.tableName,
        rows.length,
      ]);
    }

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(summary),
      'Tổng hợp',
    );

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  exportCurrentPage({ headers, rows }: CurrentPageExport): Buffer {
    if (
      !Array.isArray(headers) ||
      headers.length === 0 ||
      headers.length > 200 ||
      headers.some(
        (header) =>
          typeof header !== 'string' ||
          header.trim().length === 0 ||
          header.length > 255,
      )
    ) {
      throw new BadRequestException('Danh sách cột xuất không hợp lệ.');
    }

    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.length > 5000 ||
      rows.some(
        (row) =>
          !Array.isArray(row) ||
          row.length !== headers.length ||
          row.some(
            (cell) => typeof cell !== 'string' || cell.length > 32767,
          ),
      )
    ) {
      throw new BadRequestException('Danh sách hàng cần xuất không hợp lệ.');
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dữ liệu trang');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  private getTables(): ExportTable[] {
    const tables = new Map<string, ExportTable>();

    for (const metadata of this.dataSource.entityMetadatas) {
      const table: ExportTable = {
        tableName: metadata.tableName,
        schema: metadata.schema,
        columns: metadata.columns.map((column) => ({
          databaseName: column.databaseName,
          type: column.type,
          isSelect: column.isSelect,
        })),
      };
      const key = `${table.schema ?? ''}.${table.tableName}`;
      tables.set(key, table);
    }

    if (![...tables.values()].some((table) => table.tableName === 'mat_bang')) {
      tables.set('public.mat_bang', {
        tableName: 'mat_bang',
        schema: 'public',
        columns: [
          { databaseName: 'id', type: 'integer', isSelect: true },
          { databaseName: 'cong_trinh_id', type: 'integer', isSelect: true },
          { databaseName: 'ten_mat_bang', type: 'varchar', isSelect: true },
          { databaseName: 'loai_mat_bang', type: 'varchar', isSelect: true },
          { databaseName: 'cap_mat_bang', type: 'varchar', isSelect: true },
          { databaseName: 'ranh_gioi', type: 'geometry', isSelect: true },
          {
            databaseName: 'ma_he_toa_do_nguon',
            type: 'varchar',
            isSelect: true,
          },
          { databaseName: 'trang_thai', type: 'varchar', isSelect: true },
        ],
      });
    }

    return [...tables.values()].sort((left, right) =>
      left.tableName.localeCompare(right.tableName),
    );
  }

  private toCellValue(value: unknown): string | number | boolean | Date | null {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    ) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (typeof value === 'object') {
      return JSON.stringify(value) ?? '';
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (typeof value === 'function') {
      return value.name;
    }

    return '';
  }
}
