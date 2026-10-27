import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as XLSX from 'xlsx';

import { CatPhang } from '../cat-phang/thuc-the/cat-phang.entity.js';
import { CongTrinh } from '../cong-trinh/thuc-the/cong-trinh.entity.js';
import { GiaTriTrungBinhLop } from '../gia-tri-trung-binh-lop/thuc-the/gia-tri-trung-binh-lop.entity.js';
import { LopDat } from '../lop-dat/thuc-the/lop-dat.entity.js';
import { MauThiNghiem } from '../mau-thi-nghiem/thuc-the/mau-thi-nghiem.entity.js';
import { ThanhPhanHat } from '../thanh-phan-hat/thuc-the/thanh-phan-hat.entity.js';
import { HoKhoan } from './thuc-the/ho-khoan.entity.js';
import type { AreaBounds } from '../nguoi-dung/khu-vuc-phan-cong.util.js';

export interface ImportHoKhoanResult {
  created: number;
  skipped: number;
  importedSamples: number;
  updatedSamples: number;
  layers: number;
  grainRecords: number;
  cutRecords: number;
  averageRecords: number;
  holeNames: string[];
}

interface ExcelSample {
  rowNumber: number;
  holeName: string;
  sampleCode: string;
  layerDescription: string | null;
  sample: Partial<MauThiNghiem>;
  grain: Partial<ThanhPhanHat>;
  cut: Partial<CatPhang>;
}

interface ExcelLayer {
  name: string;
  description: string | null;
  samples: ExcelSample[];
  average: Partial<GiaTriTrungBinhLop>;
}

interface ParsedWorkbook {
  holeNames: string[];
  layers: ExcelLayer[];
}

const sampleColumns: Record<string, keyof MauThiNghiem> = {
  W: 'do_am_tu_nhien_w',
  X: 'khoi_luong_the_tich_tu_nhien_g',
  Y: 'khoi_luong_the_tich_kho_gc',
  Z: 'khoi_luong_the_tich_kho_max',
  AA: 'khoi_luong_the_tich_kho_min',
  AB: 'gioi_han_chay_wl',
  AC: 'gioi_han_deo_wp',
  AD: 'chi_so_deo_ip',
  AE: 'chi_so_do_set_b',
  AF: 'khoi_luong_rieng_d',
  AG: 'he_so_rong_e0',
  AH: 'he_so_rong_emax',
  AI: 'he_so_rong_emin',
  AJ: 'do_rong_n',
  AK: 'do_bao_hoa_g',
  AQ: 'mo_dun_bien_dang_e12',
  AR: 'goc_noi_ma_sat_phi',
  AS: 'luc_dinh_ket_c',
  AT: 'goc_nghi_kho_ak',
  AU: 'goc_nghi_uot_aw',
  AV: 'cuong_do_khang_nen_kho_rk',
  AW: 'cuong_do_khang_nen_bao_hoa_rbh',
  AX: 'he_so_hoa_mem_f',
  AY: 'suc_chiu_tai_ro',
};

const grainColumns: Record<string, keyof ThanhPhanHat> = {
  F: 'cuoi_dam_200_300',
  G: 'soi_150_200',
  H: 'soi_100_150',
  I: 'hat_50_100',
  J: 'hat_20_50',
  K: 'hat_10_20',
  L: 'hat_5_10',
  M: 'hat_2_5',
  N: 'hat_1_2',
  O: 'hat_05_1',
  P: 'hat_025_05',
  Q: 'hat_008_025',
  R: 'hat_006_008',
  S: 'hat_002_006',
  T: 'hat_0006_002',
  U: 'hat_0002_0006',
  V: 'hat_duoi_0002',
};

const pressureColumns: Record<string, keyof CatPhang> = {
  AL: 'cap_ap_luc_025',
  AM: 'cap_ap_luc_05',
  AN: 'cap_ap_luc_1',
  AO: 'cap_ap_luc_2',
  AP: 'cap_ap_luc_4',
};

function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\s\u00a0]+/g, ' ');
}

function isHoleColumnHeader(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = normalizeLabel(value)
    .replace(/[()[\]:/\\_-]+/g, ' ')
    .trim();
  return (
    normalized === 'ho khoan' ||
    normalized.startsWith('ho khoan ') ||
    normalized.endsWith(' ho khoan')
  );
}

function cellText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const text = String(value).trim();
  return text === '' ? null : text;
}

function numericCell(
  value: unknown,
  column: string,
  rowNumber: number,
): string | null {
  const text = cellText(value);
  if (!text || /^#(DIV\/0!|VALUE!|N\/A|REF!|NAME\?|NUM!|NULL!)/i.test(text)) {
    return null;
  }

  const angle = text.match(/^(\d+(?:[.,]\d+)?)[º°](\d{1,2})['′]?$/);
  if (angle) {
    const degrees = Number(angle[1].replace(',', '.'));
    const minutes = Number(angle[2]);
    if (minutes < 60) {
      return (degrees + minutes / 60)
        .toFixed(6)
        .replace(/0+$/, '')
        .replace(/\.$/, '');
    }
  }

  const normalized = text.replace(',', '.');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    throw new BadRequestException(
      `Dữ liệu không phải số tại dòng ${rowNumber}, cột ${column}: "${text}".`,
    );
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    throw new BadRequestException(
      `Giá trị không hợp lệ tại dòng ${rowNumber}, cột ${column}.`,
    );
  }
  return normalized;
}

function depthRange(
  value: unknown,
  rowNumber: number,
): { from: string | null; to: string | null } {
  const text = cellText(value);
  if (!text) {
    return { from: null, to: null };
  }

  const match = text.match(
    /^\s*(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*$/,
  );
  if (!match) {
    throw new BadRequestException(
      `Độ sâu không đúng định dạng tại dòng ${rowNumber}, cột D: "${text}".`,
    );
  }

  return {
    from: match[1].replace(',', '.'),
    to: match[2].replace(',', '.'),
  };
}

function parseSampleRow(row: unknown[], rowNumber: number): ExcelSample | null {
  const holeName = cellText(row[1]);
  const sampleCode = cellText(row[2]);
  if (!holeName || !sampleCode) {
    return null;
  }
  if (holeName.length > 20) {
    throw new BadRequestException(
      `Mã hố khoan "${holeName}" ở dòng ${rowNumber} vượt quá 20 ký tự.`,
    );
  }
  if (sampleCode.length > 50) {
    throw new BadRequestException(
      `Số hiệu mẫu "${sampleCode}" ở dòng ${rowNumber} vượt quá 50 ký tự.`,
    );
  }

  const sample: Partial<MauThiNghiem> = {
    so_hieu_mau: sampleCode,
  };
  const grain: Partial<ThanhPhanHat> = {};
  const cut: Partial<CatPhang> = {};

  const stt = numericCell(row[0], 'A', rowNumber);
  if (stt !== null) {
    const value = Number(stt);
    if (!Number.isInteger(value)) {
      throw new BadRequestException(
        `Số thứ tự tại dòng ${rowNumber}, cột A phải là số nguyên.`,
      );
    }
    sample.stt = value;
  }

  const depth = depthRange(row[3], rowNumber);
  if (depth.from !== null) {
    sample.do_sau_tu = depth.from;
  }
  if (depth.to !== null) {
    sample.do_sau_den = depth.to;
  }

  const testCount = numericCell(row[4], 'E', rowNumber);
  if (testCount !== null) {
    const value = Number(testCount);
    if (!Number.isInteger(value)) {
      throw new BadRequestException(
        `Số thí nghiệm tại dòng ${rowNumber}, cột E phải là số nguyên.`,
      );
    }
    sample.so_thi_nghiem = value;
  }

  for (const [column, property] of Object.entries(sampleColumns)) {
    const value = numericCell(
      row[XLSX.utils.decode_col(column)],
      column,
      rowNumber,
    );
    if (value !== null) {
      sample[property] = value as never;
    }
  }

  for (const [column, property] of Object.entries(grainColumns)) {
    const value = numericCell(
      row[XLSX.utils.decode_col(column)],
      column,
      rowNumber,
    );
    if (value !== null) {
      grain[property] = value as never;
    }
  }

  for (const [column, property] of Object.entries(pressureColumns)) {
    const value = numericCell(
      row[XLSX.utils.decode_col(column)],
      column,
      rowNumber,
    );
    if (value !== null) {
      cut[property] = value as never;
    }
  }

  const description = cellText(row[XLSX.utils.decode_col('AZ')]);
  if (description !== null) {
    sample.phan_loai_dat_da = description;
  }

  const friction = sample.goc_noi_ma_sat_phi;
  if (friction !== null && friction !== undefined) {
    cut.goc_noi_ma_sat_phi = friction;
  }
  const cohesion = sample.luc_dinh_ket_c;
  if (cohesion !== null && cohesion !== undefined) {
    cut.luc_dinh_ket_c = cohesion;
  }

  return {
    rowNumber,
    holeName,
    sampleCode,
    layerDescription: description,
    sample,
    grain,
    cut,
  };
}

function parseAverageRow(row: unknown[], rowNumber: number): ExcelLayer {
  const label = cellText(row[0]) ?? '';
  const number = label.match(/(\d+)\s*$/)?.[1];
  const description = cellText(row[XLSX.utils.decode_col('AZ')]);
  const average: Partial<GiaTriTrungBinhLop> = {};
  const compressibility = numericCell(
    row[XLSX.utils.decode_col('AL')],
    'AL',
    rowNumber,
  );
  const bearingCapacity = numericCell(
    row[XLSX.utils.decode_col('AY')],
    'AY',
    rowNumber,
  );

  if (compressibility !== null) {
    average.he_so_nen_lun_a = compressibility;
  }
  if (bearingCapacity !== null) {
    average.suc_chiu_tai_ro = bearingCapacity;
  }

  return {
    name: `Lớp ${number ?? '1'}`,
    description,
    samples: [],
    average,
  };
}

function parseWorkbook(buffer: Buffer): ParsedWorkbook {
  let parsed: ParsedWorkbook | undefined;

  for (const sheet of Object.values(
    XLSX.read(buffer, { type: 'buffer' }).Sheets,
  )) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    const headerRowIndex = rows.findIndex((row) =>
      row.some(isHoleColumnHeader),
    );
    if (headerRowIndex === -1) {
      continue;
    }

    const holeNames = new Map<string, string>();
    const layers: ExcelLayer[] = [];
    let pendingSamples: ExcelSample[] = [];

    for (
      let rowIndex = headerRowIndex + 1;
      rowIndex < rows.length;
      rowIndex += 1
    ) {
      const row = rows[rowIndex];
      const rowNumber = rowIndex + 1;
      const firstCell = cellText(row[0]);
      if (
        firstCell &&
        normalizeLabel(firstCell).startsWith('gia tri trung binh lop')
      ) {
        const layer = parseAverageRow(row, rowNumber);
        layer.samples = pendingSamples;
        if (!layer.description) {
          layer.description =
            pendingSamples.find((sample) => sample.layerDescription)
              ?.layerDescription ?? null;
        }
        layers.push(layer);
        pendingSamples = [];
        continue;
      }

      const sample = parseSampleRow(row, rowNumber);
      if (!sample) {
        continue;
      }

      const holeKey = sample.holeName.toLocaleUpperCase('vi');
      if (!holeNames.has(holeKey)) {
        holeNames.set(holeKey, sample.holeName);
      }
      pendingSamples.push(sample);
    }

    if (pendingSamples.length > 0) {
      const groupedSamples = new Map<string, ExcelSample[]>();
      for (const sample of pendingSamples) {
        const key = sample.layerDescription ?? 'Lớp chưa phân loại';
        const group = groupedSamples.get(key) ?? [];
        group.push(sample);
        groupedSamples.set(key, group);
      }

      const firstLayerNumber = layers.length + 1;
      for (const [index, [description, samples]] of [
        ...groupedSamples,
      ].entries()) {
        layers.push({
          name: `Lớp ${firstLayerNumber + index}`,
          description:
            description === 'Lớp chưa phân loại' ? null : description,
          samples,
          average: {},
        });
      }
    }

    parsed = { holeNames: [...holeNames.values()], layers };
    break;
  }

  if (!parsed) {
    throw new BadRequestException(
      'Không tìm thấy cột "Hố khoan" trong file Excel. Hãy chọn bảng có hàng tiêu đề chứa cột Hố khoan và các dòng dữ liệu có Số hiệu mẫu.',
    );
  }
  if (parsed.holeNames.length === 0) {
    throw new BadRequestException(
      'File Excel không có dòng mẫu gồm cả mã hố khoan và số hiệu mẫu.',
    );
  }

  return parsed;
}

function hasValues(record: object): boolean {
  return Object.keys(record).length > 0;
}

@Injectable()
export class HoKhoanService {
  constructor(
    @InjectRepository(HoKhoan)
    private readonly repository: Repository<HoKhoan>,
    @InjectRepository(CongTrinh)
    private readonly congTrinhRepository: Repository<CongTrinh>,
  ) {}

  findAll(congTrinhId?: number, allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    if (congTrinhId === undefined && !allowedProjectIds) {
      return this.repository.find();
    }
    if (allowedProjectIds) {
      if (
        congTrinhId !== undefined &&
        !allowedProjectIds.includes(congTrinhId)
      ) {
        return Promise.resolve([]);
      }
      return this.repository.find({
        where: {
          cong_trinh_id: In(
            congTrinhId === undefined ? allowedProjectIds : [congTrinhId],
          ),
        },
      });
    }
    return this.repository.find({
      where: { cong_trinh_id: congTrinhId },
    });
  }

  findAllWithinArea(
    bounds: AreaBounds,
    congTrinhId?: number,
    allowedProjectIds?: number[],
  ) {
    if (allowedProjectIds?.length === 0) return Promise.resolve([]);
    const query = this.repository
      .createQueryBuilder('hole')
      .where('hole.latitude IS NOT NULL')
      .andWhere('hole.longitude IS NOT NULL');
    if (congTrinhId !== undefined) {
      query.andWhere('hole.cong_trinh_id = :congTrinhId', { congTrinhId });
    }
    if (allowedProjectIds) {
      query.andWhere('hole.cong_trinh_id IN (:...allowedProjectIds)', {
        allowedProjectIds,
      });
    }
    if (bounds.geometry) {
      query.andWhere(
        `ST_Covers(
          ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)),
          ST_SetSRID(
            ST_MakePoint(
              hole.longitude::double precision,
              hole.latitude::double precision
            ),
            4326
          )
        )`,
        { geometry: JSON.stringify(bounds.geometry) },
      );
    } else {
      query
        .andWhere('hole.latitude BETWEEN :south AND :north', {
          south: bounds.south,
          north: bounds.north,
        })
        .andWhere('hole.longitude BETWEEN :west AND :east', {
          west: bounds.west,
          east: bounds.east,
        });
    }
    return query.getMany();
  }

  findProjects() {
    return this.congTrinhRepository.find({
      order: { ten_cong_trinh: 'ASC' },
    });
  }

  validateWorkbook(buffer: Buffer): void {
    parseWorkbook(buffer);
  }

  async importFromExcel(
    buffer: Buffer,
    congTrinhId: number,
  ): Promise<ImportHoKhoanResult> {
    if (!Number.isInteger(congTrinhId) || congTrinhId < 1) {
      throw new BadRequestException('Vui lòng chọn công trình hợp lệ.');
    }

    const project = await this.congTrinhRepository.findOne({
      where: { id: congTrinhId },
    });
    if (!project) {
      throw new BadRequestException('Công trình đã chọn không tồn tại.');
    }

    const parsed = parseWorkbook(buffer);

    return this.repository.manager.transaction(async (manager) => {
      const holeRepository = manager.getRepository(HoKhoan);
      const layerRepository = manager.getRepository(LopDat);
      const sampleRepository = manager.getRepository(MauThiNghiem);
      const grainRepository = manager.getRepository(ThanhPhanHat);
      const cutRepository = manager.getRepository(CatPhang);
      const averageRepository = manager.getRepository(GiaTriTrungBinhLop);

      const existingHoles = await holeRepository.find({
        where: { cong_trinh_id: congTrinhId },
      });
      const holesByName = new Map(
        existingHoles.map((hole) => [
          hole.ma_ho_khoan.toLocaleUpperCase('vi'),
          hole,
        ]),
      );
      const missingHoles = parsed.holeNames
        .filter((name) => !holesByName.has(name.toLocaleUpperCase('vi')))
        .map((ma_ho_khoan) =>
          holeRepository.create({
            cong_trinh_id: congTrinhId,
            ma_ho_khoan,
            x_vn2000: null,
            y_vn2000: null,
            latitude: null,
            longitude: null,
          }),
        );
      const savedHoles =
        missingHoles.length > 0 ? await holeRepository.save(missingHoles) : [];
      for (const hole of savedHoles) {
        holesByName.set(hole.ma_ho_khoan.toLocaleUpperCase('vi'), hole);
      }

      const existingLayers = await layerRepository.find({
        where: { cong_trinh_id: congTrinhId },
      });
      const layersByName = new Map(
        existingLayers
          .filter((layer) => layer.ten_lop)
          .map((layer) => [layer.ten_lop!.toLocaleLowerCase('vi'), layer]),
      );
      const layerIds = new Map<string, number>();
      const layerRows: Array<{
        layer: ExcelLayer;
        entity: LopDat;
      }> = [];

      for (const layer of parsed.layers) {
        if (layer.samples.length === 0) {
          continue;
        }
        const key = layer.name.toLocaleLowerCase('vi');
        const existing = layersByName.get(key);
        const entity = layerRepository.create(existing ?? {});
        Object.assign(entity, {
          cong_trinh_id: congTrinhId,
          ten_lop: layer.name,
          mo_ta: layer.description ?? existing?.mo_ta ?? null,
        });
        layerRows.push({ layer, entity });
      }

      const savedLayers =
        layerRows.length > 0
          ? await layerRepository.save(layerRows.map(({ entity }) => entity))
          : [];
      layerRows.forEach(({ layer }, index) => {
        layerIds.set(layer.name.toLocaleLowerCase('vi'), savedLayers[index].id);
      });

      const sampleRows = parsed.layers.flatMap((layer) => {
        const layerId = layerIds.get(layer.name.toLocaleLowerCase('vi'));
        return layer.samples.map((sample) => {
          const hole = holesByName.get(sample.holeName.toLocaleUpperCase('vi'));
          if (!hole || layerId === undefined) {
            throw new BadRequestException(
              `Không thể liên kết mẫu "${sample.sampleCode}" với hố khoan hoặc lớp đất.`,
            );
          }

          return {
            source: sample,
            values: {
              ...sample.sample,
              ho_khoan_id: hole.id,
              lop_dat_id: layerId,
            } as Partial<MauThiNghiem> & {
              ho_khoan_id: number;
              lop_dat_id: number;
            },
          };
        });
      });
      const holeIds = [
        ...new Set(sampleRows.map(({ values }) => values.ho_khoan_id)),
      ];
      const existingSamples =
        holeIds.length > 0
          ? await sampleRepository.find({
              where: { ho_khoan_id: In(holeIds) },
            })
          : [];
      const samplesByKey = new Map(
        existingSamples
          .filter((sample) => sample.so_hieu_mau)
          .map((sample) => [
            `${sample.ho_khoan_id}:${sample.so_hieu_mau!.toLocaleUpperCase('vi')}`,
            sample,
          ]),
      );
      let importedSamples = 0;
      let updatedSamples = 0;
      const savedSampleRows: Array<{
        source: ExcelSample;
        sample: MauThiNghiem;
      }> = [];

      for (const { source, values } of sampleRows) {
        const key = `${values.ho_khoan_id}:${values.so_hieu_mau!.toLocaleUpperCase('vi')}`;
        const existing = samplesByKey.get(key);
        const entity = sampleRepository.create(existing ?? {});
        Object.assign(entity, {
          ...values,
        });
        const saved = await sampleRepository.save(entity);
        if (existing) {
          updatedSamples += 1;
        } else {
          importedSamples += 1;
        }
        samplesByKey.set(key, saved);
        savedSampleRows.push({ source, sample: saved });
      }

      const sampleIds = savedSampleRows.map(({ sample }) => sample.id);
      const existingGrains =
        sampleIds.length > 0
          ? await grainRepository.find({ where: { mau_id: In(sampleIds) } })
          : [];
      const grainsBySampleId = new Map(
        existingGrains.map((grain) => [grain.mau_id, grain]),
      );
      const grainRows = savedSampleRows.flatMap(({ source, sample }) => {
        if (!hasValues(source.grain)) {
          return [];
        }
        const entity = grainRepository.create(
          grainsBySampleId.get(sample.id) ?? {},
        );
        Object.assign(entity, {
          ...source.grain,
          mau_id: sample.id,
        });
        return [entity];
      });
      if (grainRows.length > 0) {
        await grainRepository.save(grainRows);
      }

      const existingCuts =
        sampleIds.length > 0
          ? await cutRepository.find({ where: { mau_id: In(sampleIds) } })
          : [];
      const cutsBySampleId = new Map(
        existingCuts.map((cut) => [cut.mau_id, cut]),
      );
      const cutRows = savedSampleRows.flatMap(({ source, sample }) => {
        if (!hasValues(source.cut)) {
          return [];
        }
        const entity = cutRepository.create(
          cutsBySampleId.get(sample.id) ?? {},
        );
        Object.assign(entity, {
          ...source.cut,
          mau_id: sample.id,
        });
        return [entity];
      });
      if (cutRows.length > 0) {
        await cutRepository.save(cutRows);
      }

      const averageRows: GiaTriTrungBinhLop[] = [];
      for (const layer of parsed.layers) {
        if (layer.samples.length === 0 || !hasValues(layer.average)) {
          continue;
        }
        const layerId = layerIds.get(layer.name.toLocaleLowerCase('vi'));
        if (layerId === undefined) {
          continue;
        }
        const existing = await averageRepository.findOne({
          where: { lop_dat_id: layerId },
        });
        const entity = averageRepository.create(existing ?? {});
        Object.assign(entity, {
          ...layer.average,
          lop_dat_id: layerId,
        });
        averageRows.push(entity);
      }
      if (averageRows.length > 0) {
        await averageRepository.save(averageRows);
      }

      return {
        created: savedHoles.length,
        skipped: parsed.holeNames.length - savedHoles.length,
        importedSamples,
        updatedSamples,
        layers: savedLayers.length,
        grainRecords: grainRows.length,
        cutRecords: cutRows.length,
        averageRecords: averageRows.length,
        holeNames: parsed.holeNames,
      };
    });
  }
}
