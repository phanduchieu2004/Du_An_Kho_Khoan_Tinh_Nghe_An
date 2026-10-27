import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { CatPhang } from '../cat-phang/thuc-the/cat-phang.entity.js';
import { CongTrinhTaiLieu } from '../cong-trinh/thuc-the/cong-trinh-tai-lieu.entity.js';
import { GiaTriTrungBinhLop } from '../gia-tri-trung-binh-lop/thuc-the/gia-tri-trung-binh-lop.entity.js';
import { HoKhoan } from '../ho-khoan/thuc-the/ho-khoan.entity.js';
import { LopDat } from '../lop-dat/thuc-the/lop-dat.entity.js';
import { MauThiNghiem } from '../mau-thi-nghiem/thuc-the/mau-thi-nghiem.entity.js';
import { ThanhPhanHat } from '../thanh-phan-hat/thuc-the/thanh-phan-hat.entity.js';
import { VaiTro } from '../vai-tro/thuc-the/vai-tro.entity.js';
import { parseBoundaryCoordinates } from '../mat-bang/hinh-hoc.util.js';

interface RecordDefinition {
  label: string;
  entity?: EntityTarget<ObjectLiteral>;
  key: string;
  special?: 'mat_bang';
}

const records: Record<string, RecordDefinition> = {
  ho_khoan: { label: 'Hố khoan', entity: HoKhoan, key: 'id' },
  lop_dat: { label: 'Lớp đất', entity: LopDat, key: 'id' },
  mau_thi_nghiem: { label: 'Mẫu thí nghiệm', entity: MauThiNghiem, key: 'id' },
  thanh_phan_hat: { label: 'Thành phần hạt', entity: ThanhPhanHat, key: 'id' },
  cat_phang: { label: 'Cắt phẳng', entity: CatPhang, key: 'id' },
  gia_tri_trung_binh_lop: {
    label: 'Giá trị trung bình lớp',
    entity: GiaTriTrungBinhLop,
    key: 'id',
  },
  vai_tro: { label: 'Vai trò', entity: VaiTro, key: 'ma_vai_tro' },
  cong_trinh_tai_lieu: {
    label: 'Tài liệu công trình',
    entity: CongTrinhTaiLieu,
    key: 'id',
  },
  mat_bang: { label: 'Mặt bằng', key: 'id', special: 'mat_bang' },
};

export interface EditField {
  name: string;
  label: string;
  value: string;
  type: string;
  required: boolean;
  writeOnly: boolean;
}

@Injectable()
export class RecordActionsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getEditPage(
    table: string,
    id: number,
    allowedProjectIds?: number[],
  ) {
    await this.ensureProjectAccess(table, id, allowedProjectIds);
    const definition = this.getDefinition(table);
    if (definition.special === 'mat_bang') {
      const rows = await this.dataSource.query(
        `SELECT id, cong_trinh_id, ten_mat_bang, loai_mat_bang, cap_mat_bang,
                ST_AsGeoJSON(ranh_gioi)::text AS ranh_gioi,
                ma_he_toa_do_nguon, trang_thai
         FROM mat_bang WHERE id = $1`,
        [id],
      ) as Record<string, unknown>[];
      const record = rows[0];
      if (!record) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
      return {
        title: `Sửa dữ liệu · ${definition.label}`,
        table,
        label: definition.label,
        id,
        fields: [
          this.field('cong_trinh_id', record.cong_trinh_id, 'number', true, false),
          this.field('ten_mat_bang', record.ten_mat_bang, 'text', true, false),
          this.field('loai_mat_bang', record.loai_mat_bang, 'text', true, false),
          this.field('cap_mat_bang', record.cap_mat_bang, 'number', false, false),
          this.field('ranh_gioi', record.ranh_gioi, 'textarea', true, false),
          this.field('ma_he_toa_do_nguon', record.ma_he_toa_do_nguon, 'text', true, false),
          this.field('trang_thai', record.trang_thai, 'text', true, false),
        ],
      };
    }
    const repository = this.repository(definition);
    const record = await repository.findOne({
      where: { [definition.key]: id } as FindOptionsWhere<ObjectLiteral>,
    });
    if (!record) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');

    const fields: EditField[] = table === 'cong_trinh_tai_lieu'
      ? [
        this.field('loai_tai_lieu', record.loai_tai_lieu, 'text', true, false),
        this.field('ten_file', record.ten_file, 'text', true, false),
      ]
      : repository.metadata.columns
        .filter((column) => !column.isPrimary && !column.isGenerated)
        .map((column) => this.field(
          column.propertyName,
          record[column.propertyName],
          this.inputType(column.type),
          !column.isNullable && column.default === undefined && column.isSelect,
          !column.isSelect,
        ));

    return {
      title: `Sửa dữ liệu · ${definition.label}`,
      table,
      label: definition.label,
      id,
      fields,
    };
  }

  async update(
    table: string,
    id: number,
    body: Record<string, string>,
    allowedProjectIds?: number[],
  ) {
    await this.ensureProjectAccess(table, id, allowedProjectIds);
    const definition = this.getDefinition(table);
    if (definition.special === 'mat_bang') {
      await this.updateSurveyArea(id, body, allowedProjectIds);
      return;
    }
    const repository = this.repository(definition);
    const record = await repository.findOne({
      where: { [definition.key]: id } as FindOptionsWhere<ObjectLiteral>,
    });
    if (!record) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
    if (allowedProjectIds) {
      const ownershipFields: Record<string, string[]> = {
        ho_khoan: ['cong_trinh_id'],
        lop_dat: ['cong_trinh_id'],
        mau_thi_nghiem: ['ho_khoan_id', 'lop_dat_id'],
        cat_phang: ['mau_id'],
        thanh_phan_hat: ['mau_id'],
        gia_tri_trung_binh_lop: ['lop_dat_id'],
        cong_trinh_tai_lieu: [],
      };
      for (const field of ownershipFields[table] ?? []) {
        const value = body[field];
        if (
          value !== undefined &&
          value.trim() !== String(record[field] ?? '')
        ) {
          throw new ForbiddenException(
            'Không thể chuyển dữ liệu sang công trình ngoài khu vực được phân công.',
          );
        }
      }
    }
    if (table === 'cong_trinh_tai_lieu') {
      for (const field of ['loai_tai_lieu', 'ten_file']) {
        if (!body[field]?.trim()) throw new BadRequestException(`Vui lòng nhập ${field}.`);
      }
      record.loai_tai_lieu = body.loai_tai_lieu.trim();
      record.ten_file = body.ten_file.trim();
    } else {
      for (const column of repository.metadata.columns) {
        if (column.isPrimary || column.isGenerated) continue;
        const raw = body[column.propertyName];
        if (!column.isSelect && !raw?.trim()) continue;
        if (column.type === 'boolean' && raw === undefined) {
          record[column.propertyName] = false;
          continue;
        }
        if (raw === undefined) continue;
        if (raw === '') {
          if (column.isNullable) {
            record[column.propertyName] = null;
            continue;
          }
          if (column.default !== undefined) continue;
          throw new BadRequestException(`Vui lòng nhập ${column.propertyName}.`);
        }
        record[column.propertyName] = this.parseValue(
          raw,
          column.type,
          column.propertyName,
        );
      }
    }
    await repository.save(record);
  }

  async delete(
    table: string,
    id: number,
    allowedProjectIds?: number[],
  ) {
    await this.ensureProjectAccess(table, id, allowedProjectIds);
    const definition = this.getDefinition(table);
    const files: string[] = [];
    if (definition.special === 'mat_bang') {
      const deleted = await this.dataSource.query(
        'DELETE FROM mat_bang WHERE id = $1 RETURNING id',
        [id],
      ) as unknown[];
      if (!deleted.length) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
      return;
    }
    const entity = definition.entity;
    if (!entity) {
      throw new BadRequestException('Bảng chưa hỗ trợ thao tác xóa.');
    }
    await this.dataSource.transaction(async (manager) => {
      if (table === 'ho_khoan' || table === 'lop_dat') {
        if (table === 'lop_dat') {
          await manager.query(
            'DELETE FROM gia_tri_trung_binh_lop WHERE lop_dat_id = $1',
            [id],
          );
        }
        const foreignKey = table === 'ho_khoan' ? 'ho_khoan_id' : 'lop_dat_id';
        await this.deleteSamples(manager, foreignKey, id);
      } else if (table === 'mau_thi_nghiem') {
        await manager.query('DELETE FROM cat_phang WHERE mau_id = $1', [id]);
        await manager.query('DELETE FROM thanh_phan_hat WHERE mau_id = $1', [id]);
      } else if (table === 'cong_trinh_tai_lieu') {
        const document = await manager.getRepository(CongTrinhTaiLieu).findOne({
          where: { id },
        });
        if (!document) throw new NotFoundException('Không tìm thấy tài liệu.');
        files.push(this.documentPath(document.cong_trinh_id, document.ten_luu_tru));
      }

      const result = await manager.getRepository(entity).delete({
        [definition.key]: id,
      });
      if (!result.affected) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
    });

    for (const file of files) {
      try {
        await unlink(file);
      } catch (error) {
        if (!this.isMissingFile(error)) throw error;
      }
    }
  }

  private async deleteSamples(
    manager: EntityManager,
    foreignKey: 'ho_khoan_id' | 'lop_dat_id',
    id: number,
  ) {
    const samples = await manager.query(
      `SELECT id FROM mau_thi_nghiem WHERE "${foreignKey}" = $1`,
      [id],
    ) as Array<{ id: number }>;
    const ids = samples.map((sample) => sample.id);
    if (ids.length) {
      await manager.query('DELETE FROM cat_phang WHERE mau_id = ANY($1::int[])', [ids]);
      await manager.query('DELETE FROM thanh_phan_hat WHERE mau_id = ANY($1::int[])', [ids]);
    }
    await manager.query(`DELETE FROM mau_thi_nghiem WHERE "${foreignKey}" = $1`, [id]);
  }

  private field(
    name: string,
    value: unknown,
    type: string,
    required: boolean,
    writeOnly: boolean,
  ): EditField {
    return {
      name,
      label: name === 'cap_mat_bang'
        ? 'Cấp mặt bằng'
        : name.replaceAll('_', ' '),
      value: value instanceof Date
        ? value.toISOString().slice(0, 16)
        : value === null || value === undefined
          ? ''
          : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? `${value}`
            : JSON.stringify(value) ?? '',
      type,
      required,
      writeOnly,
    };
  }

  private async updateSurveyArea(
    id: number,
    body: Record<string, string>,
    allowedProjectIds?: number[],
  ) {
    const projectId = Number(body.cong_trinh_id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new BadRequestException('Mã công trình phải là số nguyên dương.');
    }
    if (allowedProjectIds) {
      const [current] = await this.dataSource.query(
        'SELECT cong_trinh_id FROM mat_bang WHERE id = $1',
        [id],
      ) as Array<{ cong_trinh_id: number | string }>;
      if (!current || Number(current.cong_trinh_id) !== projectId) {
        throw new ForbiddenException(
          'Không thể chuyển dữ liệu sang công trình ngoài khu vực được phân công.',
        );
      }
    }
    for (const name of ['ten_mat_bang', 'loai_mat_bang', 'ma_he_toa_do_nguon', 'trang_thai']) {
      if (!body[name]?.trim()) throw new BadRequestException(`Vui lòng nhập ${name.replaceAll('_', ' ')}.`);
    }
    if (
      body.cap_mat_bang !== undefined &&
      (typeof body.cap_mat_bang !== 'string' ||
        (body.cap_mat_bang !== '' &&
          (!/^[1-9]\d{0,19}$/.test(body.cap_mat_bang))))
    ) {
      throw new BadRequestException('Cấp mặt bằng phải là số nguyên dương không quá 20 chữ số.');
    }

    let geometry: unknown;
    if (body.ranh_gioi.trim().startsWith('{')) {
      try {
        geometry = JSON.parse(body.ranh_gioi);
      } catch {
        throw new BadRequestException('Ranh giới phải là GeoJSON hợp lệ.');
      }
    } else {
      geometry = parseBoundaryCoordinates(body.ranh_gioi);
    }
    if (!this.isValidGeometry(geometry)) {
      throw new BadRequestException('Ranh giới phải là Polygon/MultiPolygon hợp lệ theo WGS84.');
    }
    const rows = await this.dataSource.query(
      `UPDATE mat_bang SET
        cong_trinh_id = $1,
        ten_mat_bang = $2,
        loai_mat_bang = $3,
        ranh_gioi = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::json), 4326)),
        ma_he_toa_do_nguon = $5,
        trang_thai = $6,
        cap_mat_bang = $7
       WHERE id = $8 RETURNING id`,
      [
        projectId,
        body.ten_mat_bang.trim(),
        body.loai_mat_bang.trim(),
        JSON.stringify(geometry),
        body.ma_he_toa_do_nguon.trim(),
        body.trang_thai.trim(),
        body.cap_mat_bang?.trim() || null,
        id,
      ],
    ) as unknown[];
    if (!rows.length) throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
  }

  private isValidGeometry(value: unknown): boolean {
    if (!value || typeof value !== 'object' || !('type' in value) ||
        !('coordinates' in value) || !Array.isArray(value.coordinates)) return false;
    const isPosition = (point: unknown): point is number[] =>
      Array.isArray(point) && point.length >= 2 &&
      typeof point[0] === 'number' && typeof point[1] === 'number' &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90;
    const isRing = (ring: unknown): boolean => {
      if (!Array.isArray(ring) || ring.length < 4 || !ring.every(isPosition)) return false;
      const first = ring[0];
      const last = ring[ring.length - 1];
      return first[0] === last[0] && first[1] === last[1];
    };
    const isPolygon = (polygon: unknown): boolean =>
      Array.isArray(polygon) && polygon.length > 0 && polygon.every(isRing);
    if (value.type === 'Polygon') return isPolygon(value.coordinates);
    return value.type === 'MultiPolygon' &&
      value.coordinates.length > 0 && value.coordinates.every(isPolygon);
  }

  private inputType(type: string | Function): string {
    const value = String(type).toLowerCase();
    if (value.includes('bool')) return 'checkbox';
    if (value.includes('timestamp') || value === 'date') return 'datetime-local';
    if (['int', 'numeric', 'decimal', 'real', 'float'].some((item) => value.includes(item))) {
      return 'number';
    }
    return value === 'text' ? 'textarea' : 'text';
  }

  private parseValue(raw: string, type: string | Function, field: string): unknown {
    const value = String(type).toLowerCase();
    if (value.includes('bool')) {
      if (raw !== 'true' && raw !== 'false') {
        throw new BadRequestException(`${field} không hợp lệ.`);
      }
      return raw === 'true';
    }
    if (['int', 'numeric', 'decimal', 'real', 'float'].some((item) => value.includes(item))) {
      const integer = value.includes('int');
      const pattern = integer ? /^[+-]?\d+$/ : /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
      if (!pattern.test(raw) || !Number.isFinite(Number(raw))) {
        throw new BadRequestException(`${field} phải là số hợp lệ.`);
      }
      return integer ? Number(raw) : raw;
    }
    if (value.includes('timestamp') || value === 'date') {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} không hợp lệ.`);
      return date;
    }
    return raw;
  }

  private getDefinition(table: string): RecordDefinition {
    const definition = records[table];
    if (!definition) throw new NotFoundException('Không hỗ trợ thao tác với bảng này.');
    return definition;
  }

  private async ensureProjectAccess(
    table: string,
    id: number,
    allowedProjectIds?: number[],
  ): Promise<number | undefined> {
    if (!allowedProjectIds) return undefined;
    const queries: Record<string, string> = {
      ho_khoan: 'SELECT cong_trinh_id FROM ho_khoan WHERE id = $1',
      lop_dat: 'SELECT cong_trinh_id FROM lop_dat WHERE id = $1',
      mau_thi_nghiem: `SELECT COALESCE(h.cong_trinh_id, l.cong_trinh_id) AS cong_trinh_id
        FROM mau_thi_nghiem s
        LEFT JOIN ho_khoan h ON h.id = s.ho_khoan_id
        LEFT JOIN lop_dat l ON l.id = s.lop_dat_id
        WHERE s.id = $1`,
      cat_phang: `SELECT COALESCE(h.cong_trinh_id, l.cong_trinh_id) AS cong_trinh_id
        FROM cat_phang c
        JOIN mau_thi_nghiem s ON s.id = c.mau_id
        LEFT JOIN ho_khoan h ON h.id = s.ho_khoan_id
        LEFT JOIN lop_dat l ON l.id = s.lop_dat_id
        WHERE c.id = $1`,
      thanh_phan_hat: `SELECT COALESCE(h.cong_trinh_id, l.cong_trinh_id) AS cong_trinh_id
        FROM thanh_phan_hat t
        JOIN mau_thi_nghiem s ON s.id = t.mau_id
        LEFT JOIN ho_khoan h ON h.id = s.ho_khoan_id
        LEFT JOIN lop_dat l ON l.id = s.lop_dat_id
        WHERE t.id = $1`,
      gia_tri_trung_binh_lop: `SELECT l.cong_trinh_id
        FROM gia_tri_trung_binh_lop g
        JOIN lop_dat l ON l.id = g.lop_dat_id
        WHERE g.id = $1`,
      cong_trinh_tai_lieu:
        'SELECT cong_trinh_id FROM cong_trinh_tai_lieu WHERE id = $1',
      mat_bang: 'SELECT cong_trinh_id FROM mat_bang WHERE id = $1',
    };
    const query = queries[table];
    if (!query) {
      throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
    }
    const [record] = await this.dataSource.query(query, [id]) as Array<{
      cong_trinh_id: number | string | null;
    }>;
    const projectId = Number(record?.cong_trinh_id);
    if (!Number.isInteger(projectId) || !allowedProjectIds.includes(projectId)) {
      throw new NotFoundException('Không tìm thấy dòng dữ liệu.');
    }
    return projectId;
  }

  private repository(definition: RecordDefinition): Repository<ObjectLiteral> {
    if (!definition.entity) {
      throw new BadRequestException('Bảng này sử dụng hình học PostGIS.');
    }
    return this.dataSource.getRepository(definition.entity);
  }

  private documentPath(projectId: number, storedName: string): string {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(storedName)) {
      throw new BadRequestException('Tên tệp lưu trữ không hợp lệ.');
    }
    return join(process.cwd(), 'uploads', 'cong-trinh', String(projectId), storedName);
  }

  private isMissingFile(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
  }
}
