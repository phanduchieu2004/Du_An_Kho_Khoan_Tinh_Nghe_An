import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository, ILike } from 'typeorm';
import { mkdir, unlink, writeFile, access, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';

import { CongTrinh } from './thuc-the/cong-trinh.entity.js';
import { CongTrinhTaiLieu } from './thuc-the/cong-trinh-tai-lieu.entity.js';
import { parseBoundaryCoordinates } from '../mat-bang/hinh-hoc.util.js';

export interface ProjectSurveyInput {
  cap_mat_bang?: string | null;
  ten_mat_bang: string;
  loai_mat_bang: string;
  ranh_gioi: string;
  ma_he_toa_do_nguon: string;
  trang_thai: string;
}

export interface ProjectSurveyUpdateInput extends ProjectSurveyInput {
  id: number;
}

export interface UploadedProjectFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ProjectDocumentDownload {
  document: CongTrinhTaiLieu;
  path: string;
}

export type ProjectDetailTableKey =
  | 'thong-tin-cong-trinh'
  | 'mat-bang-cap-1'
  | 'mat-bang-cap-2'
  | 'mat-bang-cap-3'
  | 'mat-bang-cap-4'
  | 'bang-ho-khoan';

const allowedExtensions = new Set([
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.dwg',
]);
const allowedDocumentTypes = new Set([
  'Báo cáo thiết kế',
  'Báo cáo khảo sát địa chất',
  'Tài liệu khác',
]);

const PROJECT_DETAIL_SECTIONS = [
  {
    title: 'Thông tin công trình',
    columns: [
      'id',
      'ten_cong_trinh',
      'dia_diem',
      'hang_muc',
      'ghi_chu',
      'ngay_tao',
      'ngay_cap_nhat',
    ],
  },
  {
    title: 'Mặt bằng',
    columns: [
      'id',
      'cong_trinh_id',
      'ten_mat_bang',
      'loai_mat_bang',
      'cap_mat_bang',
      'mat_bang_cap_1_id',
      'ranh_gioi',
      'ma_he_toa_do_nguon',
      'trang_thai',
    ],
  },
  {
    title: 'Hố khoan',
    columns: [
      'id',
      'cong_trinh_id',
      'ma_ho_khoan',
      'x_vn2000',
      'y_vn2000',
      'latitude',
      'longitude',
    ],
  },
  {
    title: 'Lớp đất',
    columns: ['id', 'cong_trinh_id', 'ten_lop', 'mo_ta'],
  },
  {
    title: 'Mẫu thí nghiệm',
    columns: [
      'id',
      'ho_khoan_id',
      'lop_dat_id',
      'stt',
      'so_hieu_mau',
      'do_sau_tu',
      'do_sau_den',
      'so_thi_nghiem',
      'do_am_tu_nhien_w',
      'khoi_luong_the_tich_tu_nhien_g',
      'khoi_luong_the_tich_kho_gc',
      'khoi_luong_the_tich_kho_max',
      'khoi_luong_the_tich_kho_min',
      'gioi_han_chay_wl',
      'gioi_han_deo_wp',
      'chi_so_deo_ip',
      'chi_so_do_set_b',
      'khoi_luong_rieng_d',
      'he_so_rong_e0',
      'he_so_rong_emax',
      'he_so_rong_emin',
      'do_rong_n',
      'do_bao_hoa_g',
      'he_so_nen_lun_a',
      'mo_dun_bien_dang_e12',
      'goc_noi_ma_sat_phi',
      'luc_dinh_ket_c',
      'goc_nghi_kho_ak',
      'goc_nghi_uot_aw',
      'cuong_do_khang_nen_kho_rk',
      'cuong_do_khang_nen_bao_hoa_rbh',
      'he_so_hoa_mem_f',
      'suc_chiu_tai_ro',
      'phan_loai_dat_da',
    ],
  },
  {
    title: 'Thành phần hạt',
    columns: [
      'id',
      'mau_id',
      'cuoi_dam_200_300',
      'soi_150_200',
      'soi_100_150',
      'hat_50_100',
      'hat_20_50',
      'hat_10_20',
      'hat_5_10',
      'hat_2_5',
      'hat_1_2',
      'hat_05_1',
      'hat_025_05',
      'hat_008_025',
      'hat_006_008',
      'hat_002_006',
      'hat_0006_002',
      'hat_0002_0006',
      'hat_duoi_0002',
    ],
  },
  {
    title: 'Cắt phẳng',
    columns: [
      'id',
      'mau_id',
      'cap_ap_luc_025',
      'cap_ap_luc_05',
      'cap_ap_luc_1',
      'cap_ap_luc_2',
      'cap_ap_luc_4',
      'goc_noi_ma_sat_phi',
      'luc_dinh_ket_c',
    ],
  },
  {
    title: 'Giá trị trung bình lớp',
    columns: [
      'id',
      'lop_dat_id',
      'suc_chiu_tai_ro',
      'he_so_nen_lun_a',
      'ghi_chu',
    ],
  },
  {
    title: 'Tài liệu công trình',
    columns: [
      'id',
      'cong_trinh_id',
      'loai_tai_lieu',
      'ten_file',
      'ten_luu_tru',
      'mime_type',
      'kich_thuoc',
      'ngay_tao',
    ],
  },
] as const;

const EXCEL_IMPORT_COLUMN_LABELS = [
  'Thứ tự',
  'Hố khoan',
  'Số hiệu mẫu',
  'Độ sâu (Từ - Đến)',
  'Số thí nghiệm',
  'Cuội (Dăm) 200 - 300 (mm)',
  'Cuội (Dăm) 150 - 200 (mm)',
  'Hạt sỏi (sạn) 100 - 150 (mm)',
  'Hạt sỏi (sạn) 50 - 100 (mm)',
  'Hạt sỏi (sạn) 20 - 50 (mm)',
  'Hạt sỏi (sạn) 10 - 20 (mm)',
  'Hạt sỏi (sạn) 5 - 10 (mm)',
  'Hạt sỏi (sạn) 2 - 5 (mm)',
  'Hạt cát 1 - 2 (mm)',
  'Hạt cát 0,5 - 1 (mm)',
  'Hạt cát 0,25 - 0,5 (mm)',
  'Hạt cát 0,08 - 0,25 (mm)',
  'Hạt cát 0,06 - 0,08 (mm)',
  'Hạt bụi 0,02 - 0,06 (mm)',
  'Hạt bụi 0,006 - 0,02 (mm)',
  'Hạt bụi 0,002 - 0,006 (mm)',
  'Hạt sét < 0,002 (mm)',
  'Độ ẩm tự nhiên W (%)',
  'Khối lượng thể tích tự nhiên g (g/cm3)',
  'Khối lượng thể tích khô gc (g/cm3)',
  'Khối lượng thể tích khô lớn nhất gc max (g/cm3)',
  'Khối lượng thể tích khô nhỏ nhất gc min (g/cm3)',
  'Giới hạn chảy WL (%)',
  'Giới hạn dẻo WP (%)',
  'Chỉ số dẻo IP (%)',
  'Chỉ số độ sệt B',
  'Khối lượng riêng D (g/cm3)',
  'Hệ số rỗng e0',
  'Hệ số rỗng lớn nhất emax',
  'Hệ số rỗng nhỏ nhất emin',
  'Độ rỗng n (%)',
  'Độ bão hòa G (%)',
  'Cấp áp lực 0,25 (kG/cm2)',
  'Cấp áp lực 0,5 (kG/cm2)',
  'Cấp áp lực 1 (kG/cm2)',
  'Cấp áp lực 2 (kG/cm2)',
  'Cấp áp lực 4 (kG/cm2)',
  'Mô đun tổng biến dạng E1-2 (kG/cm2)',
  'Góc nội ma sát j (độ)',
  'Lực dính kết C (kG/cm2)',
  'Góc nghỉ ở trạng thái khô ak (độ)',
  'Góc nghỉ ở trạng thái ướt aw (độ)',
  'Cường độ kháng nén ở trạng thái khô Rk (kG/cm2)',
  'Cường độ kháng nén ở trạng thái bão hòa Rbh (kG/cm2)',
  'Hệ số hóa mềm f',
  'Sức chịu tải quy ước Ro (kG/cm2)',
  'Phân loại đất đá',
];

const EXCEL_GRAIN_FIELDS = [
  'cuoi_dam_200_300',
  'soi_150_200',
  'soi_100_150',
  'hat_50_100',
  'hat_20_50',
  'hat_10_20',
  'hat_5_10',
  'hat_2_5',
  'hat_1_2',
  'hat_05_1',
  'hat_025_05',
  'hat_008_025',
  'hat_006_008',
  'hat_002_006',
  'hat_0006_002',
  'hat_0002_0006',
  'hat_duoi_0002',
] as const;

const EXCEL_SAMPLE_FIELDS: ReadonlyArray<readonly [number, string]> = [
  [22, 'do_am_tu_nhien_w'],
  [23, 'khoi_luong_the_tich_tu_nhien_g'],
  [24, 'khoi_luong_the_tich_kho_gc'],
  [25, 'khoi_luong_the_tich_kho_max'],
  [26, 'khoi_luong_the_tich_kho_min'],
  [27, 'gioi_han_chay_wl'],
  [28, 'gioi_han_deo_wp'],
  [29, 'chi_so_deo_ip'],
  [30, 'chi_so_do_set_b'],
  [31, 'khoi_luong_rieng_d'],
  [32, 'he_so_rong_e0'],
  [33, 'he_so_rong_emax'],
  [34, 'he_so_rong_emin'],
  [35, 'do_rong_n'],
  [36, 'do_bao_hoa_g'],
  [42, 'mo_dun_bien_dang_e12'],
  [43, 'goc_noi_ma_sat_phi'],
  [44, 'luc_dinh_ket_c'],
  [45, 'goc_nghi_kho_ak'],
  [46, 'goc_nghi_uot_aw'],
  [47, 'cuong_do_khang_nen_kho_rk'],
  [48, 'cuong_do_khang_nen_bao_hoa_rbh'],
  [49, 'he_so_hoa_mem_f'],
  [50, 'suc_chiu_tai_ro'],
  [51, 'phan_loai_dat_da'],
];

type ProjectDetailSection = {
  title: string;
  columns: readonly string[];
  rows: Array<Record<string, unknown>>;
};

type ProjectUpdateData = Pick<
  CongTrinh,
  'ten_cong_trinh' | 'dia_diem' | 'hang_muc' | 'ghi_chu'
>;

type ProjectEditPayload = {
  project: ProjectUpdateData;
  surveys: ProjectSurveyUpdateInput[];
};

export interface LevelSurveyRequest {
  id: number;
  cong_trinh_id: number;
  ten_cong_trinh: string | null;
  mat_bang_cap_1_id: number;
  mat_bang_cha_id: number;
  cap_mat_bang: number;
  ten_mat_bang_cha: string;
  ten_mat_bang_cap_1: string;
  ten_mat_bang: string;
  loai_mat_bang: string;
  ranh_gioi: unknown;
  ma_he_toa_do_nguon: string;
  nguoi_yeu_cau: string;
  ngay_tao: Date;
}

@Injectable()
export class CongTrinhService implements OnModuleInit {
  constructor(
    @InjectRepository(CongTrinh)
    private readonly repository: Repository<CongTrinh>,
    @InjectRepository(CongTrinhTaiLieu)
    private readonly documentRepository: Repository<CongTrinhTaiLieu>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.query(`
      ALTER TABLE mat_bang
      ADD COLUMN IF NOT EXISTS mat_bang_cap_1_id INTEGER
    `);
    await this.repository.query(`
      ALTER TABLE mat_bang
      ADD COLUMN IF NOT EXISTS mat_bang_cha_id INTEGER
    `);
    await this.repository.query(`
      UPDATE mat_bang
      SET mat_bang_cha_id = mat_bang_cap_1_id
      WHERE mat_bang_cha_id IS NULL
        AND mat_bang_cap_1_id IS NOT NULL
        AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = '2'
    `);
    await this.repository.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'mat_bang_cap_1_id_fkey'
        ) THEN
          ALTER TABLE mat_bang
          ADD CONSTRAINT mat_bang_cap_1_id_fkey
          FOREIGN KEY (mat_bang_cap_1_id)
          REFERENCES mat_bang(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS mat_bang_cap_1_id_idx
        ON mat_bang (mat_bang_cap_1_id)
    `);
    await this.repository.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'mat_bang_mat_bang_cha_id_fkey'
        ) THEN
          ALTER TABLE mat_bang
          ADD CONSTRAINT mat_bang_mat_bang_cha_id_fkey
          FOREIGN KEY (mat_bang_cha_id)
          REFERENCES mat_bang(id) ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS mat_bang_mat_bang_cha_id_idx
        ON mat_bang (mat_bang_cha_id)
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS cong_trinh_sua_doi (
        id BIGSERIAL PRIMARY KEY,
        cong_trinh_id INTEGER NOT NULL
          REFERENCES cong_trinh(id) ON DELETE CASCADE,
        du_lieu_cu JSONB NOT NULL,
        du_lieu_de_xuat JSONB NOT NULL,
        nguoi_yeu_cau TEXT NOT NULL,
        nguoi_duyet TEXT,
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
          CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly TIMESTAMP
      )
    `);
    await this.repository.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_sua_doi_moi_cho_duyet
        ON cong_trinh_sua_doi (cong_trinh_id)
        WHERE trang_thai = 'cho_duyet'
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS cong_trinh_sua_doi_lich_su
        ON cong_trinh_sua_doi (cong_trinh_id, ngay_xu_ly DESC)
        WHERE trang_thai = 'da_duyet'
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS mat_bang_cap_2_cho_duyet (
        id BIGSERIAL PRIMARY KEY,
        cong_trinh_id INTEGER NOT NULL
          REFERENCES cong_trinh(id) ON DELETE CASCADE,
        mat_bang_cap_1_id INTEGER NOT NULL
          REFERENCES mat_bang(id) ON DELETE CASCADE,
        mat_bang_cha_id INTEGER
          REFERENCES mat_bang(id) ON DELETE CASCADE,
        cap_mat_bang VARCHAR(20) NOT NULL DEFAULT '2',
        ten_mat_bang TEXT NOT NULL,
        loai_mat_bang TEXT NOT NULL,
        ranh_gioi JSONB NOT NULL,
        ma_he_toa_do_nguon TEXT NOT NULL,
        nguoi_yeu_cau TEXT NOT NULL,
        nguoi_duyet TEXT,
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
          CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly TIMESTAMP
      )
    `);
    await this.repository.query(`
      ALTER TABLE mat_bang_cap_2_cho_duyet
      ADD COLUMN IF NOT EXISTS mat_bang_cha_id INTEGER
        REFERENCES mat_bang(id) ON DELETE CASCADE
    `);
    await this.repository.query(`
      ALTER TABLE mat_bang_cap_2_cho_duyet
      ADD COLUMN IF NOT EXISTS cap_mat_bang VARCHAR(20) NOT NULL DEFAULT '2'
    `);
    await this.repository.query(`
      UPDATE mat_bang_cap_2_cho_duyet
      SET mat_bang_cha_id = mat_bang_cap_1_id
      WHERE mat_bang_cha_id IS NULL
    `);
    await this.repository.query(`
      CREATE INDEX IF NOT EXISTS mat_bang_cap_2_cho_duyet_trang_thai_idx
        ON mat_bang_cap_2_cho_duyet (trang_thai, ngay_tao, id)
    `);
  }

  findAll(allowedProjectIds?: number[]) {
    if (allowedProjectIds?.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository.find({
      where: {
        da_duyet: true,
        ...(allowedProjectIds ? { id: In(allowedProjectIds) } : {}),
      },
      order: {
        id: 'DESC',
      },
    });
  }

  async findProjectsWithLevelOneSurveyAreas(allowedProjectIds?: number[]) {
    const projects = await this.findAll(allowedProjectIds);
    if (projects.length === 0) {
      return projects;
    }

    const projectIds = projects.map((project) => project.id);
    const levelOneRows = (await this.repository.manager.query(
      `SELECT DISTINCT cong_trinh_id
       FROM mat_bang
       WHERE REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = '1'
         AND cong_trinh_id = ANY($1::integer[])`,
      [projectIds],
    )) as Array<{ cong_trinh_id: number }>;
    const levelOneProjectIds = new Set(
      levelOneRows.map((row) => Number(row.cong_trinh_id)),
    );

    return projects.filter((project) => levelOneProjectIds.has(project.id));
  }

  findPendingApproval() {
    return this.repository.find({
      where: { da_duyet: false },
      order: { ngay_tao: 'DESC', id: 'DESC' },
    });
  }

  findCreatedBy(userId: number) {
    return this.repository.find({
      where: { nguoi_tao: userId },
      order: { ngay_tao: 'DESC', id: 'DESC' },
    });
  }

  countPendingApproval() {
    return this.repository.count({ where: { da_duyet: false } });
  }

  async approveProject(projectId: number): Promise<void> {
    const result = await this.repository.update(
      { id: projectId, da_duyet: false },
      { da_duyet: true, ngay_cap_nhat: new Date() },
    );
    if (result.affected !== 1) {
      throw new NotFoundException(
        'Không tìm thấy công trình đang chờ duyệt.',
      );
    }
  }

  async findOne(projectId: number): Promise<CongTrinh> {
    const project = await this.repository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Không tìm thấy công trình.');
    }
    return project;
  }

  async findProjectDetails(projectId: number) {
    const project = await this.findOne(projectId);
    const manager = this.repository.manager;
    const surveyAreaRows = await manager.query(
      `SELECT mat_bang.*,
              ST_AsGeoJSON(ranh_gioi)::json AS boundary_json,
              CASE
                WHEN REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') IN ('2', '3', '4')
                THEN COALESCE(
                  (
                    SELECT parent.ten_mat_bang
                    FROM mat_bang parent
                      WHERE parent.id = COALESCE(mat_bang.mat_bang_cap_1_id, mat_bang.mat_bang_cha_id)
                      AND parent.cong_trinh_id = mat_bang.cong_trinh_id
                      AND REGEXP_REPLACE(TRIM(parent.cap_mat_bang::text), '\\.0+$', '') = '1'
                  ),
                  (
                    SELECT string_agg(DISTINCT parent.ten_mat_bang, ', ')
                    FROM mat_bang parent
                    WHERE parent.cong_trinh_id = mat_bang.cong_trinh_id
                      AND REGEXP_REPLACE(TRIM(parent.cap_mat_bang::text), '\\.0+$', '') = '1'
                      AND ST_Intersects(
                        ST_MakeValid(parent.ranh_gioi),
                        ST_MakeValid(mat_bang.ranh_gioi)
                      )
                  )
                )
                ELSE NULL
              END AS mat_bang_cap_1
       FROM mat_bang
       WHERE cong_trinh_id = $1
       ORDER BY id`,
      [projectId],
    ) as Array<Record<string, unknown> & { id: number }>;
    const surveyAreas = surveyAreaRows.map(({ boundary_json, ...row }) => ({
      ...row,
      ranh_gioi: boundary_json,
    }));
    const boreholes = await manager.query(
      `SELECT *
       FROM ho_khoan
       WHERE cong_trinh_id = $1
       ORDER BY id`,
      [projectId],
    ) as Array<Record<string, unknown> & { id: number }>;
    const layers = await manager.query(
      `SELECT *
       FROM lop_dat
       WHERE cong_trinh_id = $1
       ORDER BY id`,
      [projectId],
    ) as Array<Record<string, unknown> & { id: number }>;
    const boreholeIds = boreholes.map((row) => row.id);
    const layerIds = layers.map((row) => row.id);
    const samples = await manager.query(
      `SELECT *
       FROM mau_thi_nghiem
       WHERE ho_khoan_id = ANY($1::integer[])
          OR lop_dat_id = ANY($2::integer[])
       ORDER BY id`,
      [boreholeIds, layerIds],
    ) as Array<Record<string, unknown> & { id: number }>;
    const sampleIds = samples.map((row) => row.id);
    const grainRecords = await manager.query(
      `SELECT * FROM thanh_phan_hat WHERE mau_id = ANY($1::integer[]) ORDER BY id`,
      [sampleIds],
    ) as Array<Record<string, unknown>>;
    const cutRecords = await manager.query(
      `SELECT * FROM cat_phang WHERE mau_id = ANY($1::integer[]) ORDER BY id`,
      [sampleIds],
    ) as Array<Record<string, unknown>>;
    const layerIdsWithSamples = [...new Set([
      ...layerIds,
      ...samples
        .map((row) => row.lop_dat_id)
        .filter((id): id is number => typeof id === 'number'),
    ])];
    const averageRecords = await manager.query(
      `SELECT * FROM gia_tri_trung_binh_lop
       WHERE lop_dat_id = ANY($1::integer[])
       ORDER BY id`,
      [layerIdsWithSamples],
    ) as Array<Record<string, unknown>>;
    const documents = await this.documentRepository.find({
      where: { cong_trinh_id: projectId },
      order: { id: 'ASC' },
    });

    const rowsBySection: Record<string, Array<Record<string, unknown>>> = {
      'Thông tin công trình': [project as unknown as Record<string, unknown>],
      'Mặt bằng': surveyAreas,
      'Hố khoan': boreholes,
      'Lớp đất': layers,
      'Mẫu thí nghiệm': samples,
      'Thành phần hạt': grainRecords,
      'Cắt phẳng': cutRecords,
      'Giá trị trung bình lớp': averageRecords,
      'Tài liệu công trình': documents as unknown as Array<Record<string, unknown>>,
    };
    const detailSections = PROJECT_DETAIL_SECTIONS.flatMap<ProjectDetailSection>((section) => {
      if (section.title !== 'Mặt bằng') {
        return [{
          ...section,
          rows: rowsBySection[section.title] ?? [],
        }];
      }

      const levelOf = (row: Record<string, unknown>) => {
        const value = row.cap_mat_bang;
        if (typeof value !== 'string' && typeof value !== 'number') {
          return '';
        }
        return String(value).trim().replace(/\.0+$/, '');
      };
      const areas = rowsBySection['Mặt bằng'] ?? [];

      return [
        ...[1, 2, 3, 4].map((level) => ({
          title: `Mặt bằng cấp ${level}`,
          columns: section.columns,
          rows: areas.filter((row) => levelOf(row) === String(level)),
        })),
        {
          title: 'Mặt bằng chưa phân cấp',
          columns: section.columns,
          rows: areas.filter((row) => !['1', '2', '3', '4'].includes(levelOf(row))),
        },
      ];

    });

    const holesById = new Map(
      boreholes.map((row) => [Number(row.id), row]),
    );
    const grainsBySampleId = new Map(
      grainRecords.map((row) => [Number(row.mau_id), row]),
    );
    const cutsBySampleId = new Map(
      cutRecords.map((row) => [Number(row.mau_id), row]),
    );
    const averagesByLayerId = new Map(
      averageRecords.map((row) => [Number(row.lop_dat_id), row]),
    );
    const excelRows: unknown[][] = [];
    for (const layer of layers) {
      const layerSamples = samples.filter(
        (sample) => Number(sample.lop_dat_id) === Number(layer.id),
      );
      for (const sample of layerSamples) {
        const row = Array<unknown>(EXCEL_IMPORT_COLUMN_LABELS.length).fill(null);
        const hole = holesById.get(Number(sample.ho_khoan_id));
        const grain = grainsBySampleId.get(Number(sample.id));
        const cut = cutsBySampleId.get(Number(sample.id));
        row[0] = sample.stt ?? null;
        row[1] = hole?.ma_ho_khoan ?? null;
        row[2] = sample.so_hieu_mau ?? null;
        const depthFrom = sample.do_sau_tu;
        const depthTo = sample.do_sau_den;
        row[3] =
          (typeof depthFrom === 'string' || typeof depthFrom === 'number') &&
          (typeof depthTo === 'string' || typeof depthTo === 'number')
            ? `${depthFrom}-${depthTo}`
            : null;
        row[4] = sample.so_thi_nghiem ?? null;
        EXCEL_GRAIN_FIELDS.forEach((field, index) => {
          row[index + 5] = grain?.[field] ?? null;
        });
        EXCEL_SAMPLE_FIELDS.forEach(([index, field]) => {
          row[index] = sample[field] ?? null;
        });
        [
          'cap_ap_luc_025',
          'cap_ap_luc_05',
          'cap_ap_luc_1',
          'cap_ap_luc_2',
          'cap_ap_luc_4',
        ].forEach((field, index) => {
          row[index + 37] = cut?.[field] ?? null;
        });
        excelRows.push(row);
      }

      const average = averagesByLayerId.get(Number(layer.id));
      if (average) {
        const row = Array<unknown>(EXCEL_IMPORT_COLUMN_LABELS.length).fill(null);
        const layerName = layer.ten_lop;
        row[0] =
          typeof layerName === 'string'
            ? `Giá trị trung bình ${layerName.toLocaleLowerCase('vi')}`
            : 'Giá trị trung bình lớp';
        row[37] = average.he_so_nen_lun_a ?? null;
        row[50] = average.suc_chiu_tai_ro ?? null;
        excelRows.push(row);
      }
    }

    return {
      project,
      detailSections,
      excelColumns: EXCEL_IMPORT_COLUMN_LABELS,
      excelRows,
      sections: PROJECT_DETAIL_SECTIONS.map((section) => ({
        ...section,
        rows: rowsBySection[section.title] ?? [],
      })),
    };
  }

  async findSurveyAreasByLevel(projectId: number, level: number) {
    if (!Number.isInteger(level) || level < 1 || level > 3) {
      throw new BadRequestException('Cấp mặt bằng cha không hợp lệ.');
    }
    await this.findOne(projectId);
    return (await this.repository.manager.query(
      `SELECT id, ten_mat_bang
       FROM mat_bang
       WHERE cong_trinh_id = $1
         AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = $2
       ORDER BY id`,
      [projectId, String(level)],
    )) as Array<{ id: number; ten_mat_bang: string }>;
  }

  async submitLevelTwoSurveyRequest(
    projectId: number,
    parentSurveyId: number,
    survey: Omit<ProjectSurveyInput, 'cap_mat_bang' | 'trang_thai'>,
    requestedBy: string,
  ): Promise<void> {
    return this.submitLevelSurveyRequest(
      projectId,
      parentSurveyId,
      2,
      survey,
      requestedBy,
    );
  }

  async submitLevelSurveyRequest(
    projectId: number,
    parentSurveyId: number,
    level: number,
    survey: Omit<ProjectSurveyInput, 'cap_mat_bang' | 'trang_thai'>,
    requestedBy: string,
  ): Promise<void> {
    if (!Number.isInteger(level) || level < 2 || level > 4) {
      throw new BadRequestException('Chỉ hỗ trợ thêm mặt bằng cấp 2, 3 hoặc 4.');
    }
    const geometry = this.validateSurvey({
      ...survey,
      cap_mat_bang: String(level),
      trang_thai: 'cho_xac_minh',
    });
    await this.repository.manager.transaction(async (manager) => {
      const projects = (await manager.query(
        `SELECT id
         FROM cong_trinh
         WHERE id = $1
         FOR UPDATE`,
        [projectId],
      )) as Array<{ id: number }>;
      if (!projects[0]) {
        throw new NotFoundException('Không tìm thấy công trình.');
      }
      const parents = (await manager.query(
        `SELECT id
         FROM mat_bang
         WHERE id = $1 AND cong_trinh_id = $2
           AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = $3
         FOR UPDATE`,
        [parentSurveyId, projectId, String(level - 1)],
      )) as Array<{ id: number }>;
      const parent = parents[0];
      if (!parent) {
        throw new BadRequestException(
          `Mã mặt bằng cấp ${level - 1} không thuộc công trình này.`,
        );
      }
      const roots = (await manager.query(
        `WITH RECURSIVE hierarchy AS (
           SELECT id, cong_trinh_id, cap_mat_bang,
                  COALESCE(mat_bang_cha_id, mat_bang_cap_1_id) AS parent_id
           FROM mat_bang
           WHERE id = $1 AND cong_trinh_id = $2
           UNION
           SELECT parent.id, parent.cong_trinh_id, parent.cap_mat_bang,
                  COALESCE(parent.mat_bang_cha_id, parent.mat_bang_cap_1_id)
           FROM mat_bang parent
           JOIN hierarchy child ON parent.id = child.parent_id
         )
         SELECT id
         FROM hierarchy
         WHERE REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = '1'
           AND cong_trinh_id = $2
         LIMIT 1`,
        [parentSurveyId, projectId],
      )) as Array<{ id: number }>;
      const rootId = roots[0]?.id;
      if (!rootId) {
        throw new BadRequestException(
          'Mặt bằng cha không liên kết với mặt bằng cấp 1.',
        );
      }
      const overlaps = (await manager.query(
        `SELECT ST_Intersects(
           ST_MakeValid(parent.ranh_gioi),
           ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
         ) AS intersects
         FROM mat_bang parent
         WHERE parent.id = $1 AND parent.cong_trinh_id = $2`,
        [parentSurveyId, projectId, geometry],
      )) as Array<{ intersects: boolean }>;
      if (!overlaps[0]?.intersects) {
        throw new BadRequestException(
          `Ranh giới mặt bằng cấp ${level} phải giao với mặt bằng cấp ${level - 1} đã chọn.`,
        );
      }
      await manager.query(
        `INSERT INTO mat_bang_cap_2_cho_duyet
           (cong_trinh_id, mat_bang_cap_1_id, mat_bang_cha_id,
            cap_mat_bang, ten_mat_bang,
            loai_mat_bang, ranh_gioi, ma_he_toa_do_nguon, nguoi_yeu_cau)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          projectId,
          rootId,
          parentSurveyId,
          String(level),
          survey.ten_mat_bang.trim(),
          survey.loai_mat_bang.trim(),
          geometry,
          survey.ma_he_toa_do_nguon.trim(),
          requestedBy,
        ],
      );
    });
  }

  async findPendingLevelTwoSurveyRequests(
    level = 2,
  ): Promise<LevelSurveyRequest[]> {
    return this.findPendingSurveyRequests(level);
  }

  async findPendingSurveyRequests(
    level?: number,
  ): Promise<LevelSurveyRequest[]> {
    if (level !== undefined && (!Number.isInteger(level) || level < 2 || level > 4)) {
      throw new BadRequestException('Cấp mặt bằng chờ duyệt không hợp lệ.');
    }
    return (await this.repository.manager.query(
      `SELECT request.id, request.cong_trinh_id,
              project.ten_cong_trinh, request.mat_bang_cap_1_id,
              request.mat_bang_cha_id,
              request.cap_mat_bang::integer AS cap_mat_bang,
              parent.ten_mat_bang AS ten_mat_bang_cha,
              root.ten_mat_bang AS ten_mat_bang_cap_1,
              request.ten_mat_bang, request.loai_mat_bang,
              request.ranh_gioi,
              request.ma_he_toa_do_nguon, request.nguoi_yeu_cau,
              request.ngay_tao
       FROM mat_bang_cap_2_cho_duyet request
       JOIN cong_trinh project ON project.id = request.cong_trinh_id
       JOIN mat_bang parent
         ON parent.id = COALESCE(request.mat_bang_cha_id, request.mat_bang_cap_1_id)
       JOIN mat_bang root ON root.id = request.mat_bang_cap_1_id
       WHERE request.trang_thai = 'cho_duyet'
         AND ($1::integer IS NULL OR request.cap_mat_bang::integer = $1)
       ORDER BY request.ngay_tao, request.id`,
      [level ?? null],
    )) as LevelSurveyRequest[];
  }

  async approveLevelTwoSurveyRequest(
    requestId: number,
    approvedBy: string,
  ): Promise<void> {
    return this.approveLevelSurveyRequest(requestId, 2, approvedBy);
  }

  async approveLevelSurveyRequest(
    requestId: number,
    level: number,
    approvedBy: string,
  ): Promise<void> {
    if (!Number.isInteger(level) || level < 2 || level > 4) {
      throw new BadRequestException('Cấp mặt bằng chờ duyệt không hợp lệ.');
    }
    await this.repository.manager.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT id, cong_trinh_id, mat_bang_cap_1_id,
                COALESCE(mat_bang_cha_id, mat_bang_cap_1_id) AS mat_bang_cha_id,
                cap_mat_bang::integer, ten_mat_bang,
                loai_mat_bang, ranh_gioi, ma_he_toa_do_nguon
         FROM mat_bang_cap_2_cho_duyet
         WHERE id = $1 AND cap_mat_bang::integer = $2
           AND trang_thai = 'cho_duyet'
         FOR UPDATE`,
        [requestId, level],
      )) as Array<{
        id: number;
        cong_trinh_id: number;
        mat_bang_cap_1_id: number;
        mat_bang_cha_id: number;
        cap_mat_bang: number;
        ten_mat_bang: string;
        loai_mat_bang: string;
        ranh_gioi: unknown;
        ma_he_toa_do_nguon: string;
      }>;
      const request = rows[0];
      if (!request) {
        throw new NotFoundException(
          `Không tìm thấy yêu cầu thêm mặt bằng cấp ${level} đang chờ duyệt.`,
        );
      }
      const boundary =
        typeof request.ranh_gioi === 'string'
          ? request.ranh_gioi
          : JSON.stringify(request.ranh_gioi);
      const geometry = this.validateSurvey({
        ten_mat_bang: request.ten_mat_bang,
        loai_mat_bang: request.loai_mat_bang,
        cap_mat_bang: String(level),
        ranh_gioi: boundary,
        ma_he_toa_do_nguon: request.ma_he_toa_do_nguon,
        trang_thai: 'cho_xac_minh',
      });
      const parents = (await manager.query(
        `SELECT id
         FROM mat_bang
         WHERE id = $1 AND cong_trinh_id = $2
           AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = $3
         FOR UPDATE`,
        [request.mat_bang_cha_id, request.cong_trinh_id, String(level - 1)],
      )) as Array<{ id: number }>;
      if (!parents[0]) {
        throw new BadRequestException(
          `Mặt bằng cấp ${level - 1} được chọn không còn thuộc công trình này.`,
        );
      }
      const roots = (await manager.query(
        `SELECT id
         FROM mat_bang
         WHERE id = $1 AND cong_trinh_id = $2
           AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\\.0+$', '') = '1'
         FOR UPDATE`,
        [request.mat_bang_cap_1_id, request.cong_trinh_id],
      )) as Array<{ id: number }>;
      if (!roots[0]) {
        throw new BadRequestException(
          'Mặt bằng cấp 1 gốc không còn thuộc công trình này.',
        );
      }
      const overlaps = (await manager.query(
        `SELECT ST_Intersects(
           ST_MakeValid(parent.ranh_gioi),
           ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326))
         ) AS intersects
         FROM mat_bang parent
         WHERE parent.id = $1 AND parent.cong_trinh_id = $2`,
        [request.mat_bang_cha_id, request.cong_trinh_id, geometry],
      )) as Array<{ intersects: boolean }>;
      if (!overlaps[0]?.intersects) {
        throw new BadRequestException(
          `Ranh giới mặt bằng cấp ${level} không còn giao với mặt bằng cấp ${level - 1} đã chọn.`,
        );
      }
      await manager.query(
        `INSERT INTO mat_bang (
           cong_trinh_id, mat_bang_cap_1_id, mat_bang_cha_id,
           ten_mat_bang, loai_mat_bang, cap_mat_bang, ranh_gioi,
           ma_he_toa_do_nguon, trang_thai
         )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($7::json), 4326)),
           $8, 'cho_xac_minh'
         )`,
        [
          request.cong_trinh_id,
          request.mat_bang_cap_1_id,
          request.mat_bang_cha_id,
          request.ten_mat_bang.trim(),
          request.loai_mat_bang.trim(),
          String(level),
          geometry,
          request.ma_he_toa_do_nguon.trim(),
        ],
      );
      await manager.query(
        `UPDATE mat_bang_cap_2_cho_duyet
         SET trang_thai = 'da_duyet',
             nguoi_duyet = $1,
             ngay_xu_ly = CURRENT_TIMESTAMP
         WHERE id = $2 AND trang_thai = 'cho_duyet'`,
        [approvedBy, requestId],
      );
    });
  }

  async exportProjectWorkbook(projectId: number): Promise<Buffer> {
    const { project, detailSections, excelRows } =
      await this.findProjectDetails(projectId);
    const hiddenColumns = new Set(['id', 'cong_trinh_id']);
    const levelOneSection = detailSections.find(
      (section) => section.title === 'Mặt bằng cấp 1',
    );
    const levelTwoSection = detailSections.find(
      (section) => section.title === 'Mặt bằng cấp 2',
    );
    const collectColumns = (section?: ProjectDetailSection) => section
      ? [...new Set([
        ...section.columns,
        ...section.rows.flatMap((row) => Object.keys(row)),
      ])].filter((column) => !hiddenColumns.has(column))
      : [];
    const toCellValue = (value: unknown, column: string) => {
      if (value === null || value === undefined) return null;
      if (
        (value instanceof Date || typeof value === 'string') &&
        /(^|_)(ngay|date|created|updated|uploaded)(_|$)/i.test(column)
      ) {
        const date = value instanceof Date ? value : new Date(value);
        if (!Number.isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(date);
        }
      }
      if (typeof value === 'object' && !(value instanceof Date)) {
        return JSON.stringify(value);
      }
      return value as string | number | boolean | Date;
    };
    const columnLabel = (column: string) => {
      const labels: Record<string, string> = {
        mat_bang_cap_1: 'Thuộc mặt bằng cấp 1',
        ten_cong_trinh: 'Tên công trình',
        dia_diem: 'Địa điểm',
        hang_muc: 'Hạng mục',
        ghi_chu: 'Ghi chú',
        ten_mat_bang: 'Tên mặt bằng',
        loai_mat_bang: 'Loại mặt bằng',
        cap_mat_bang: 'Cấp mặt bằng',
        ranh_gioi: 'Ranh giới',
        ma_he_toa_do_nguon: 'Hệ tọa độ nguồn',
        trang_thai: 'Trạng thái',
        ma_ho_khoan: 'Mã hố khoan',
        x_vn2000: 'Tọa độ X (VN-2000)',
        y_vn2000: 'Tọa độ Y (VN-2000)',
        latitude: 'Vĩ độ',
        longitude: 'Kinh độ',
        ten_lop: 'Tên lớp đất',
        mo_ta: 'Mô tả',
        ho_khoan_id: 'Mã hố khoan',
        lop_dat_id: 'Mã lớp đất',
        mau_id: 'Mã mẫu',
        stt: 'Số thứ tự',
        so_hieu_mau: 'Số hiệu mẫu',
        do_sau_tu: 'Độ sâu từ (m)',
        do_sau_den: 'Độ sâu đến (m)',
        so_thi_nghiem: 'Số thí nghiệm',
        loai_tai_lieu: 'Loại tài liệu',
        ten_file: 'Tên tệp',
        ten_luu_tru: 'Tên lưu trữ',
        mime_type: 'Định dạng tệp',
        kich_thuoc: 'Dung lượng',
      };
      return labels[column] ?? column.replaceAll('_', ' ');
    };
    const workbook = XLSX.utils.book_new();
    const appendSurveySheet = (
      section: ProjectDetailSection | undefined,
      sheetName: string,
    ) => {
      const columns = collectColumns(section);
      const rows = section?.rows ?? [];
      const worksheet = XLSX.utils.aoa_to_sheet([
        columns.map(columnLabel),
        ...rows.map((row) =>
          columns.map((column) => toCellValue(row[column], column)),
        ),
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    };
    appendSurveySheet(levelOneSection, 'Mặt bằng cấp 1');
    appendSurveySheet(levelTwoSection, 'Mặt bằng cấp 2');

    const templateBuffer = await readFile(
      join(process.cwd(), 'Bang tong hop So TP.xls'),
    );
    const templateWorkbook = XLSX.read(templateBuffer, {
      type: 'buffer',
      cellStyles: true,
    });
    const templateSheet = templateWorkbook.Sheets['1'];
    if (!templateSheet || !templateSheet['!ref']) {
      throw new Error('Không tìm thấy bảng mẫu tổng hợp hố khoan trong file Excel.');
    }
    templateSheet.A2 = {
      ...templateSheet.A2,
      t: 's',
      v: `CÔNG TRÌNH:  ${project.ten_cong_trinh ?? ''}`,
    };
    templateSheet.A3 = {
      ...templateSheet.A3,
      t: 's',
      v: `ĐỊA ĐIỂM:  ${project.dia_diem ?? ''}`,
    };
    templateSheet.A4 = {
      ...templateSheet.A4,
      t: 's',
      v: `HẠNG MỤC:  ${project.hang_muc ?? ''}`,
    };

    const templateRange = XLSX.utils.decode_range(templateSheet['!ref']);
    const firstDataRow = 8;
    const templateMerges = templateSheet['!merges'] ?? [];
    const templateHeaderValue = (row: number, column: number): unknown => {
      const merge = templateMerges.find(
        ({ s, e }) =>
          row >= s.r &&
          row <= e.r &&
          column >= s.c &&
          column <= e.c,
      );
      const address = XLSX.utils.encode_cell(merge?.s ?? { r: row, c: column });
      return templateSheet[address]?.v;
    };
    const headerText = (value: unknown): string =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    const normalizeHeader = (value: unknown) =>
      headerText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('vi')
        .replace(/[^a-z0-9]/g, '');
    const sourceColumnByTemplateColumn = new Map<number, number>();
    for (let column = 0; column < EXCEL_IMPORT_COLUMN_LABELS.length; column += 1) {
      let templateHeader: unknown;
      if (column >= 5 && column <= 21) {
        templateHeader = `${headerText(templateHeaderValue(6, column))} ${headerText(templateHeaderValue(7, column))}`;
      } else if (column >= 37 && column <= 41) {
        templateHeader = `Cấp áp lực ${headerText(templateHeaderValue(7, column))} (kG/cm2)`;
      } else if (column === 43 || column === 44) {
        templateHeader = templateHeaderValue(6, column);
      } else {
        templateHeader = templateHeaderValue(5, column);
      }
      const sourceColumn = EXCEL_IMPORT_COLUMN_LABELS.findIndex(
        (label) => normalizeHeader(label) === normalizeHeader(templateHeader),
      );
      if (sourceColumn >= 0) {
        sourceColumnByTemplateColumn.set(column, sourceColumn);
      }
    }
    if (sourceColumnByTemplateColumn.size !== EXCEL_IMPORT_COLUMN_LABELS.length) {
      throw new Error(
        'Không thể ánh xạ đầy đủ các cột dữ liệu vào bảng mẫu tổng hợp hố khoan.',
      );
    }
    const lastDataRow = Math.max(
      templateRange.e.r,
      firstDataRow + excelRows.length - 1,
    );
    for (let rowIndex = firstDataRow; rowIndex <= lastDataRow; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < EXCEL_IMPORT_COLUMN_LABELS.length; columnIndex += 1) {
        const address = XLSX.utils.encode_cell({
          r: rowIndex,
          c: columnIndex,
        });
        const cell = templateSheet[address];
        if (rowIndex <= templateRange.e.r) {
          if (cell) {
            delete cell.v;
            delete cell.w;
            delete cell.f;
            delete cell.t;
          }
        } else {
          const styleSource =
            templateSheet[
              XLSX.utils.encode_cell({ r: firstDataRow, c: columnIndex })
            ];
          templateSheet[address] = styleSource?.s
            ? { s: styleSource.s }
            : { t: 'z' };
        }
      }
    }
    excelRows.forEach((row, index) => {
      sourceColumnByTemplateColumn.forEach((sourceColumn, templateColumn) => {
        const value = row[sourceColumn];
        if (value === null || value === undefined || value === '') return;
        const address = XLSX.utils.encode_cell({
          r: firstDataRow + index,
          c: templateColumn,
        });
        const cell = templateSheet[address] ?? {};
        cell.v = value instanceof Date ? value : (value as string | number | boolean);
        cell.t =
          typeof value === 'number'
            ? 'n'
            : typeof value === 'boolean'
              ? 'b'
              : value instanceof Date
                ? 'd'
                : 's';
        templateSheet[address] = cell;
      });
    });
    if (lastDataRow > templateRange.e.r) {
      templateRange.e.r = lastDataRow;
      templateSheet['!ref'] = XLSX.utils.encode_range(templateRange);
    }
    XLSX.utils.book_append_sheet(workbook, templateSheet, 'Bảng tổng hợp hố khoan');

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
      cellStyles: true,
    });
  }

  async exportProjectDetailTable(
    projectId: number,
    tableKey: ProjectDetailTableKey,
  ): Promise<Buffer> {
    if (tableKey === 'bang-ho-khoan') {
      const combinedWorkbook = XLSX.read(
        await this.exportProjectWorkbook(projectId),
        { type: 'buffer', cellStyles: true },
      );
      const templateSheet =
        combinedWorkbook.Sheets['Bảng tổng hợp hố khoan'];
      if (!templateSheet) {
        throw new Error(
          'Không tìm thấy bảng mẫu tổng hợp hố khoan trong file xuất.',
        );
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        templateSheet,
        'Bảng tổng hợp hố khoan',
      );
      return XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
        cellStyles: true,
      });
    }

    const { project, detailSections } =
      await this.findProjectDetails(projectId);
    const hiddenColumns = new Set(['id', 'cong_trinh_id']);
    const sectionTitles: Partial<Record<ProjectDetailTableKey, string>> = {
      'thong-tin-cong-trinh': 'Thông tin công trình',
      'mat-bang-cap-1': 'Mặt bằng cấp 1',
      'mat-bang-cap-2': 'Mặt bằng cấp 2',
      'mat-bang-cap-3': 'Mặt bằng cấp 3',
      'mat-bang-cap-4': 'Mặt bằng cấp 4',
    };
    let sheetName: string;
    let rows: unknown[][];

    const sectionTitle = sectionTitles[tableKey];
    const section = detailSections.find(
      (candidate) => candidate.title === sectionTitle,
    );
    if (!section) {
      throw new NotFoundException('Không tìm thấy bảng công trình cần xuất.');
    }
    const columns = [...new Set([
      ...section.columns,
      ...section.rows.flatMap((row) => Object.keys(row)),
    ])].filter((column) => !hiddenColumns.has(column));
    const labels: Record<string, string> = {
      ten_cong_trinh: 'Tên công trình',
      dia_diem: 'Địa điểm',
      hang_muc: 'Hạng mục',
      ghi_chu: 'Ghi chú',
      ten_mat_bang: 'Tên mặt bằng',
      loai_mat_bang: 'Loại mặt bằng',
      cap_mat_bang: 'Cấp mặt bằng',
      mat_bang_cap_1_id: 'Mã mặt bằng cấp 1',
      mat_bang_cha_id: 'Mã mặt bằng cấp cha',
      ranh_gioi: 'Ranh giới',
      ma_he_toa_do_nguon: 'Hệ tọa độ nguồn',
      trang_thai: 'Trạng thái',
      mat_bang_cap_1: 'Thuộc mặt bằng cấp 1',
      ngay_tao: 'Ngày tạo',
      ngay_cap_nhat: 'Ngày cập nhật',
    };
    sheetName = section.title;
    rows = [
      columns.map((column) => labels[column] ?? column.replaceAll('_', ' ')),
      ...section.rows.map((row) =>
        columns.map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return null;
          if (typeof value === 'object' && !(value instanceof Date)) {
            return JSON.stringify(value);
          }
          return value as string | number | boolean | Date;
        }),
      ),
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName,
    );
    workbook.Props = {
      Title: `${sheetName} - ${project.ten_cong_trinh ?? `Công trình ${projectId}`}`,
    };
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  async findSurveyAreas(projectId: number) {
    await this.findOne(projectId);
    return await this.repository.manager.query(
      `SELECT id, ten_mat_bang, loai_mat_bang,
              ST_AsGeoJSON(ranh_gioi)::json AS ranh_gioi,
               ma_he_toa_do_nguon, trang_thai, cap_mat_bang
       FROM mat_bang
       WHERE cong_trinh_id = $1
       ORDER BY id`,
      [projectId],
    ) as Array<{
      id: number;
      ten_mat_bang: string;
      loai_mat_bang: string;
      ranh_gioi: unknown;
      ma_he_toa_do_nguon: string;
      trang_thai: string;
      cap_mat_bang: string | null;
    }>;
  }

  async updateProject(
    projectId: number,
    data: ProjectUpdateData,
    surveys?: ProjectSurveyUpdateInput[],
  ): Promise<void> {
    const normalizedSurveys = this.normalizeProjectSurveys(surveys);
    await this.repository.manager.transaction((manager) =>
      this.applyProjectUpdate(manager, projectId, data, normalizedSurveys),
    );
  }

  async submitProjectEdit(
    projectId: number,
    projectData: ProjectUpdateData,
    surveys: ProjectSurveyUpdateInput[],
    requestedBy: string,
  ): Promise<void> {
    const normalizedSurveys = this.normalizeProjectSurveys(surveys);
    if (!normalizedSurveys) {
      throw new BadRequestException('Danh sách mặt bằng không hợp lệ.');
    }

    await this.repository.manager.transaction(async (manager) => {
      await manager.query(
        'SELECT id FROM cong_trinh WHERE id = $1 FOR UPDATE',
        [projectId],
      );
      const project = await manager.getRepository(CongTrinh).findOne({
        where: { id: projectId },
      });
      if (!project) {
        throw new NotFoundException('Không tìm thấy công trình.');
      }
      const existingRows = (await manager.query(
        `SELECT id, ten_mat_bang, loai_mat_bang, cap_mat_bang,
                ST_AsGeoJSON(ranh_gioi)::json AS ranh_gioi,
                ma_he_toa_do_nguon, trang_thai
         FROM mat_bang
         WHERE cong_trinh_id = $1
         ORDER BY id
         FOR UPDATE`,
        [projectId],
      )) as Array<Record<string, unknown> & { id: number | string }>;
      this.assertSurveyIdsMatch(
        existingRows.map((row) => Number(row.id)),
        normalizedSurveys,
      );
      const pendingRows = (await manager.query(
        `SELECT id
         FROM cong_trinh_sua_doi
         WHERE cong_trinh_id = $1 AND trang_thai = 'cho_duyet'
         FOR UPDATE`,
        [projectId],
      )) as Array<{ id: number }>;
      if (pendingRows.length > 0) {
        throw new BadRequestException(
          'Công trình đã có yêu cầu sửa đang chờ duyệt.',
        );
      }

      const payload: ProjectEditPayload = {
        project: projectData,
        surveys: normalizedSurveys.map(({ geometry, ...survey }) => ({
          ...survey,
          ranh_gioi: JSON.stringify(geometry),
        })),
      };
      const currentProject: ProjectUpdateData = {
        ten_cong_trinh: project.ten_cong_trinh,
        dia_diem: project.dia_diem,
        hang_muc: project.hang_muc,
        ghi_chu: project.ghi_chu,
      };
      const currentSurveys = existingRows.map((row) => ({
        ...row,
        id: Number(row.id),
      }));

      await manager.query(
        `INSERT INTO cong_trinh_sua_doi
           (cong_trinh_id, du_lieu_cu, du_lieu_de_xuat, nguoi_yeu_cau)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
        [
          projectId,
          JSON.stringify({ project: currentProject, surveys: currentSurveys }),
          JSON.stringify(payload),
          requestedBy,
        ],
      );
    });
  }

  async findPendingProjectEdits() {
    return (await this.repository.manager.query(
      `SELECT request.id, request.cong_trinh_id,
              project.ten_cong_trinh, request.du_lieu_cu,
              request.du_lieu_de_xuat, request.nguoi_yeu_cau,
              request.ngay_tao
       FROM cong_trinh_sua_doi request
       JOIN cong_trinh project ON project.id = request.cong_trinh_id
       WHERE request.trang_thai = 'cho_duyet'
       ORDER BY request.ngay_tao, request.id`,
    )) as Array<Record<string, unknown> & {
      id: number;
      cong_trinh_id: number;
      ten_cong_trinh: string | null;
      du_lieu_cu: ProjectEditPayload;
      du_lieu_de_xuat: ProjectEditPayload;
      nguoi_yeu_cau: string;
      ngay_tao: Date;
    }>;
  }

  async approveProjectEdit(
    requestId: number,
    approvedBy: string,
  ): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      const rows = (await manager.query(
        `SELECT id, cong_trinh_id, du_lieu_de_xuat
         FROM cong_trinh_sua_doi
         WHERE id = $1 AND trang_thai = 'cho_duyet'
         FOR UPDATE`,
        [requestId],
      )) as Array<{
        id: number;
        cong_trinh_id: number;
        du_lieu_de_xuat: ProjectEditPayload | string;
      }>;
      const edit = rows[0];
      if (!edit) {
        throw new NotFoundException(
          'Không tìm thấy yêu cầu sửa công trình đang chờ duyệt.',
        );
      }

      const payload =
        typeof edit.du_lieu_de_xuat === 'string'
          ? (JSON.parse(edit.du_lieu_de_xuat) as ProjectEditPayload)
          : edit.du_lieu_de_xuat;
      const normalizedSurveys = this.normalizeProjectSurveys(payload.surveys);
      if (!normalizedSurveys) {
        throw new BadRequestException(
          'Dữ liệu yêu cầu sửa công trình không hợp lệ.',
        );
      }
      await this.applyProjectUpdate(
        manager,
        edit.cong_trinh_id,
        payload.project,
        normalizedSurveys,
      );
      await manager.query(
        `UPDATE cong_trinh_sua_doi
         SET trang_thai = 'da_duyet',
             nguoi_duyet = $1,
             ngay_xu_ly = CURRENT_TIMESTAMP
         WHERE id = $2 AND trang_thai = 'cho_duyet'`,
        [approvedBy, requestId],
      );
    });
  }

  async findProjectEditHistory(projectId: number) {
    await this.findOne(projectId);
    return (await this.repository.manager.query(
      `SELECT id, du_lieu_cu, du_lieu_de_xuat,
              nguoi_yeu_cau, nguoi_duyet, trang_thai, ngay_tao, ngay_xu_ly
       FROM cong_trinh_sua_doi
       WHERE cong_trinh_id = $1
       ORDER BY ngay_tao DESC, id DESC`,
      [projectId],
    )) as Array<Record<string, unknown> & {
      id: number;
      du_lieu_cu: ProjectEditPayload;
      du_lieu_de_xuat: ProjectEditPayload;
      nguoi_yeu_cau: string;
      nguoi_duyet: string | null;
      trang_thai: 'cho_duyet' | 'da_duyet';
      ngay_tao: Date;
      ngay_xu_ly: Date | null;
    }>;
  }

  private normalizeProjectSurveys(
    surveys?: ProjectSurveyUpdateInput[],
  ) {
    return surveys?.map((survey) => ({
      ...survey,
      cap_mat_bang: survey.cap_mat_bang?.trim() || null,
      geometry: this.validateSurvey({
        cap_mat_bang: survey.cap_mat_bang,
        ten_mat_bang: survey.ten_mat_bang,
        loai_mat_bang: survey.loai_mat_bang,
        ranh_gioi: survey.ranh_gioi,
        ma_he_toa_do_nguon: survey.ma_he_toa_do_nguon,
        trang_thai: survey.trang_thai,
      }),
    }));
  }

  private assertSurveyIdsMatch(
    currentIds: number[],
    surveys: Array<ProjectSurveyUpdateInput & { geometry: unknown }>,
  ): void {
    const existingIds = [...currentIds].sort((a, b) => a - b);
    const submittedIds = surveys
      .map((survey) => survey.id)
      .sort((a, b) => a - b);
    if (
      existingIds.length !== submittedIds.length ||
      existingIds.some((id, index) => id !== submittedIds[index])
    ) {
      throw new BadRequestException(
        'Danh sách mặt bằng đã thay đổi. Vui lòng tải lại trang trước khi lưu.',
      );
    }
  }

  private async applyProjectUpdate(
    manager: EntityManager,
    projectId: number,
    data: ProjectUpdateData,
    normalizedSurveys?: Array<ProjectSurveyUpdateInput & { geometry: unknown }>,
  ): Promise<void> {
    const projectRepository = manager.getRepository(CongTrinh);
    const project = await projectRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Không tìm thấy công trình.');
    }
    Object.assign(project, data, { ngay_cap_nhat: new Date() });
    await projectRepository.save(project);

    if (!normalizedSurveys) return;
    const existingRows = (await manager.query(
      'SELECT id FROM mat_bang WHERE cong_trinh_id = $1 FOR UPDATE',
      [projectId],
    )) as Array<{ id: number | string }>;
    this.assertSurveyIdsMatch(
      existingRows.map((row) => Number(row.id)),
      normalizedSurveys,
    );

    for (const survey of normalizedSurveys) {
      await manager.query(
        `UPDATE mat_bang
         SET ten_mat_bang = $1,
             loai_mat_bang = $2,
             ranh_gioi = ST_Multi(
               ST_SetSRID(ST_GeomFromGeoJSON($3::json), 4326)
             ),
             ma_he_toa_do_nguon = $4,
             trang_thai = $5,
             cap_mat_bang = $6
         WHERE id = $7 AND cong_trinh_id = $8`,
        [
          survey.ten_mat_bang.trim(),
          survey.loai_mat_bang.trim(),
          survey.geometry,
          survey.ma_he_toa_do_nguon.trim(),
          survey.trang_thai.trim(),
          survey.cap_mat_bang,
          survey.id,
          projectId,
        ],
      );
    }
  }

  async deleteProject(projectId: number): Promise<void> {
    const documentPaths: string[] = [];

    await this.repository.manager.transaction(async (manager) => {
      const projectRepository = manager.getRepository(CongTrinh);
      const project = await projectRepository.findOne({
        where: { id: projectId },
      });
      if (!project) {
        throw new NotFoundException('Không tìm thấy công trình cần xóa.');
      }

      const documents = await manager.getRepository(CongTrinhTaiLieu).find({
        where: { cong_trinh_id: projectId },
      });
      for (const document of documents) {
        if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(document.ten_luu_tru)) {
          throw new BadRequestException('Tên tệp lưu trữ không hợp lệ.');
        }
        documentPaths.push(join(
          process.cwd(),
          'uploads',
          'cong-trinh',
          String(projectId),
          document.ten_luu_tru,
        ));
      }

      const sampleCondition = `ho_khoan_id IN (
        SELECT id FROM ho_khoan WHERE cong_trinh_id = $1
      ) OR lop_dat_id IN (
        SELECT id FROM lop_dat WHERE cong_trinh_id = $1
      )`;
      await manager.query(
        `DELETE FROM cat_phang
         WHERE mau_id IN (SELECT id FROM mau_thi_nghiem WHERE ${sampleCondition})`,
        [projectId],
      );
      await manager.query(
        `DELETE FROM thanh_phan_hat
         WHERE mau_id IN (SELECT id FROM mau_thi_nghiem WHERE ${sampleCondition})`,
        [projectId],
      );
      await manager.query(
        `DELETE FROM mau_thi_nghiem WHERE ${sampleCondition}`,
        [projectId],
      );
      await manager.query(
        `DELETE FROM gia_tri_trung_binh_lop
         WHERE lop_dat_id IN (SELECT id FROM lop_dat WHERE cong_trinh_id = $1)`,
        [projectId],
      );
      await manager.query('DELETE FROM mat_bang WHERE cong_trinh_id = $1', [projectId]);
      await manager.getRepository(CongTrinhTaiLieu).delete({
        cong_trinh_id: projectId,
      });
      await manager.query('DELETE FROM ho_khoan WHERE cong_trinh_id = $1', [projectId]);
      await manager.query('DELETE FROM lop_dat WHERE cong_trinh_id = $1', [projectId]);

      const result = await projectRepository.delete(projectId);
      if (!result.affected) {
        throw new NotFoundException('Không tìm thấy công trình cần xóa.');
      }
    });

    for (const filePath of documentPaths) {
      try {
        await unlink(filePath);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        ) {
          throw error;
        }
      }
    }
  }

  async create(
    data: Partial<CongTrinh>,
    documentType: string,
    files: UploadedProjectFile[] = [],
    survey?: ProjectSurveyInput,
  ) {
    if (!allowedDocumentTypes.has(documentType)) {
      throw new BadRequestException('Loại tài liệu không hợp lệ.');
    }

    for (const file of files) {
      const extension = extname(file.originalname).toLowerCase();
      if (!allowedExtensions.has(extension)) {
        throw new BadRequestException(
          `Định dạng file không được hỗ trợ: ${file.originalname}`,
        );
      }
    }

    const surveyGeometry = survey ? this.validateSurvey(survey) : undefined;

    const storedPaths: string[] = [];

    try {
      return await this.repository.manager.transaction(async (manager) => {
        const projectRepository = manager.getRepository(CongTrinh);
        const documentRepository = manager.getRepository(CongTrinhTaiLieu);
        const savedProject = await projectRepository.save(
          projectRepository.create({ ...data, da_duyet: false }),
        );

        if (survey) {
          await manager.query(
            `
              INSERT INTO mat_bang (
                cong_trinh_id,
                ten_mat_bang,
                loai_mat_bang,
                ranh_gioi,
                ma_he_toa_do_nguon,
                trang_thai,
                cap_mat_bang
              )
              VALUES (
                $1, $2, $3,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4::json), 4326)),
                $5, $6, $7
              )
            `,
            [
              savedProject.id,
              survey.ten_mat_bang.trim(),
              survey.loai_mat_bang.trim(),
              surveyGeometry,
              survey.ma_he_toa_do_nguon.trim(),
              survey.trang_thai.trim(),
              survey.cap_mat_bang?.trim() || null,
            ],
          );

        }

        const uploadDirectory = join(
          process.cwd(),
          'uploads',
          'cong-trinh',
          String(savedProject.id),
        );
        if (files.length > 0) {
          await mkdir(uploadDirectory, { recursive: true });
        }

        const documents: CongTrinhTaiLieu[] = [];
        for (const file of files) {
          const pathParts = file.originalname
            .replace(/\\/g, '/')
            .split('/');
          const originalName = Array.from(pathParts.pop() ?? '')
            .map((character) => {
              const codePoint = character.codePointAt(0) ?? 0;
              return codePoint < 32 || (codePoint >= 127 && codePoint <= 159)
                ? '_'
                : character;
            })
            .join('')
            .replace(/[<>:"|?*]/g, '_')
            .trim();
          const extension = extname(originalName).toLowerCase();

          if (!originalName || !allowedExtensions.has(extension)) {
            throw new BadRequestException(
              `Định dạng file không được hỗ trợ: ${file.originalname}`,
            );
          }
          if (Buffer.byteLength(originalName, 'utf8') > 255) {
            throw new BadRequestException(
              `Tên file vượt quá 255 byte: ${originalName}`,
            );
          }

          const storedName = `${randomUUID()}${extension}`;
          const filePath = join(uploadDirectory, storedName);
          await writeFile(filePath, file.buffer, { flag: 'wx' });
          storedPaths.push(filePath);
          documents.push(
            documentRepository.create({
              cong_trinh_id: savedProject.id,
              loai_tai_lieu: documentType,
              ten_file: originalName,
              ten_luu_tru: storedName,
              mime_type: file.mimetype || 'application/octet-stream',
              kich_thuoc: String(file.size),
            }),
          );
        }

        if (documents.length > 0) {
          await documentRepository.save(documents);
        }

        return savedProject;
      });
    } catch (error) {
      try {
        await Promise.all(storedPaths.map((filePath) => unlink(filePath)));
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Không thể lưu công trình và dọn file tạm.',
        );
      }

      throw error;
    }
  }

  private validateSurvey(survey: ProjectSurveyInput): string {
    for (const [field, value] of Object.entries({
      ten_mat_bang: survey.ten_mat_bang,
      loai_mat_bang: survey.loai_mat_bang,
      ranh_gioi: survey.ranh_gioi,
      ma_he_toa_do_nguon: survey.ma_he_toa_do_nguon,
      trang_thai: survey.trang_thai,
      cap_mat_bang: survey.cap_mat_bang,
    })) {
      if (field === 'cap_mat_bang' && (value === undefined || value === null)) {
        continue;
      }
      if (typeof value !== 'string') {
        throw new BadRequestException(`Thông tin ${field} không hợp lệ.`);
      }
    }
    if (
      survey.cap_mat_bang?.trim() &&
      !/^[1-9]\d{0,19}$/.test(survey.cap_mat_bang.trim())
    ) {
      throw new BadRequestException(
        'Cấp mặt bằng phải là số nguyên dương không quá 20 chữ số.',
      );
    }

    let geometry: unknown;
    const boundary = survey.ranh_gioi.trim();
    if (boundary.startsWith('{')) {
      try {
        geometry = JSON.parse(boundary);
      } catch {
        throw new BadRequestException('Ranh giới mặt bằng phải là GeoJSON hợp lệ.');
      }
    } else {
      geometry = parseBoundaryCoordinates(boundary);
    }

    if (
      !geometry ||
      typeof geometry !== 'object' ||
      !('type' in geometry) ||
      !['Polygon', 'MultiPolygon'].includes(String(geometry.type)) ||
      !('coordinates' in geometry) ||
      !Array.isArray(geometry.coordinates) ||
      geometry.coordinates.length === 0
    ) {
      throw new BadRequestException(
        'Ranh giới phải là GeoJSON Polygon hoặc MultiPolygon có tọa độ.',
      );
    }

    const hasValidCoordinates = (coordinates: unknown): boolean => {
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return false;
      }
      if (
        coordinates.length >= 2 &&
        typeof coordinates[0] === 'number' &&
        typeof coordinates[1] === 'number'
      ) {
        return (
          Number.isFinite(coordinates[0]) &&
          Number.isFinite(coordinates[1]) &&
          coordinates[0] >= -180 &&
          coordinates[0] <= 180 &&
          coordinates[1] >= -90 &&
          coordinates[1] <= 90
        );
      }
      return coordinates.every(hasValidCoordinates);
    };
    if (!hasValidCoordinates(geometry.coordinates)) {
      throw new BadRequestException(
        'Ranh giới mặt bằng chứa tọa độ không hợp lệ.',
      );
    }

    if (
      !survey.ten_mat_bang.trim() ||
      !survey.loai_mat_bang.trim() ||
      !survey.ma_he_toa_do_nguon.trim() ||
      !survey.trang_thai.trim()
    ) {
      throw new BadRequestException('Vui lòng nhập đầy đủ thông tin mặt bằng.');
    }

    return JSON.stringify(geometry);
  }

  async findProjectDocuments(projectId: number) {
    const project = await this.repository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException('Không tìm thấy công trình.');
    }

    const documents = await this.documentRepository.find({
      where: { cong_trinh_id: projectId },
      order: { ngay_tao: 'DESC', id: 'DESC' },
    });

    return { project, documents };
  }

  async findDocumentForDownload(
    projectId: number,
    documentId: number,
  ): Promise<ProjectDocumentDownload> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, cong_trinh_id: projectId },
    });
    if (!document) {
      throw new NotFoundException('Không tìm thấy tài liệu.');
    }
    if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(document.ten_luu_tru)) {
      throw new NotFoundException('Đường dẫn tài liệu không hợp lệ.');
    }

    const filePath = join(
      process.cwd(),
      'uploads',
      'cong-trinh',
      String(projectId),
      document.ten_luu_tru,
    );
    try {
      await access(filePath);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        throw new NotFoundException('File tài liệu không còn trên máy chủ.');
      }
      throw error;
    }

    return { document, path: filePath };
  }

  // Tìm kiếm địa chỉ
  async timDiaChi(
    keyword: string,
  ) {

    if (
      !keyword ||
      keyword.trim() === ''
    ) {
      return [];
    }

    return await this.repository.find({

      where: {
        dia_diem: ILike(
          `%${keyword}%`,
        ),
      },

      order: {
        id: 'DESC',
      },

      take: 10,
    });
  }

}