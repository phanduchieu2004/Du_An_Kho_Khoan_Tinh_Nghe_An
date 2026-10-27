import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { And, ArrayContains, Not, Repository } from 'typeorm';

import { NguoiDung } from './thuc-the/nguoi-dung.entity.js';
import type { LoginRoleSlug } from '../../xac-thuc/vai-tro-dang-nhap.js';
import {
  isWithinAssignedArea,
  type AreaBounds,
  type AreaGeometry,
} from './khu-vuc-phan-cong.util.js';

export interface UserAccountInput {
  ten_dang_nhap: string;
  ho_ten: string;
  email: string | null;
  dia_chi: string | null;
  so_dien_thoai: string | null;
  ma_ky_su: string | null;
  chuyen_nganh: string | null;
  don_vi_cong_tac: string | null;
  so_chung_chi_hanh_nghe: string | null;
  trang_thai: string;
  khu_vuc_duoc_xem: string | null;
  khu_vuc_phan_cong_ranh_gioi: AreaGeometry | null;
  khu_vuc_phan_cong_vi_do: number | null;
  khu_vuc_phan_cong_kinh_do: number | null;
  khu_vuc_phan_cong_tu_ngay: string | null;
  khu_vuc_phan_cong_den_ngay: string | null;
  cong_vai_tro: LoginRoleSlug[];
  duoc_dang_nhap: boolean;
  mat_khau?: string;
}

export interface UserAccountAccess {
  ma_nguoi_dung: number;
  cong_vai_tro: LoginRoleSlug[];
  duoc_dang_nhap: boolean;
  khu_vuc_phan_cong_tu_ngay: string | null;
  khu_vuc_phan_cong_den_ngay: string | null;
  hasProjectAssignments: boolean;
  hasActiveProjectAssignments: boolean;
}

export interface EngineerProjectAssignmentInput {
  projectId: number;
  startDate: string;
  endDate: string;
  areaName: string;
  geometry: AreaGeometry;
  latitude: number;
  longitude: number;
}

export interface SelfRegistrationProfile {
  email: string | null;
  dia_chi: string | null;
  so_dien_thoai: string | null;
  ma_ky_su: string | null;
  chuyen_nganh: string | null;
  don_vi_cong_tac: string | null;
  so_chung_chi_hanh_nghe: string | null;
}

export interface UploadedAvatar {
  buffer: Buffer;
  mimetype: string;
}

export interface AreaManagedAccountInput {
  ho_ten: string;
  email: string | null;
  dia_chi: string | null;
  so_dien_thoai: string | null;
  ma_ky_su: string | null;
  chuyen_nganh: string | null;
  don_vi_cong_tac: string | null;
  so_chung_chi_hanh_nghe: string | null;
  trang_thai: string;
  duoc_dang_nhap: boolean;
  mat_khau?: string;
}

const accountProfileSelect = {
  ma_nguoi_dung: true,
  ten_dang_nhap: true,
  ho_ten: true,
  email: true,
  dia_chi: true,
  so_dien_thoai: true,
  ma_ky_su: true,
  chuyen_nganh: true,
  don_vi_cong_tac: true,
  so_chung_chi_hanh_nghe: true,
  trang_thai: true,
  ngay_tao: true,
  lan_dang_nhap_cuoi: true,
  khu_vuc_duoc_xem: true,
  khu_vuc_phan_cong_ranh_gioi: true,
  khu_vuc_phan_cong_vi_do: true,
  khu_vuc_phan_cong_kinh_do: true,
  khu_vuc_phan_cong_tu_ngay: true,
  khu_vuc_phan_cong_den_ngay: true,
  cong_vai_tro: true,
  duoc_dang_nhap: true,
} as const;

@Injectable()
export class NguoiDungService implements OnModuleInit {
  constructor(
    @InjectRepository(NguoiDung)
    private readonly repository: Repository<NguoiDung>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.repository.query(`
      ALTER TABLE cong_trinh_phan_cong
      ADD COLUMN IF NOT EXISTS trang_thai_phan_bo TEXT NOT NULL DEFAULT 'da_phan_bo'
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong_huy (
        id BIGSERIAL PRIMARY KEY,
        assignment_id BIGINT NOT NULL
          REFERENCES cong_trinh_phan_cong(id) ON DELETE CASCADE,
        ma_nguoi_dung INTEGER NOT NULL
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        ly_do TEXT NOT NULL CHECK (length(btrim(ly_do)) BETWEEN 5 AND 2000),
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
          CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly TIMESTAMP
      )
    `);
    await this.repository.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_huy_cho_duyet
      ON cong_trinh_phan_cong_huy (assignment_id)
      WHERE trang_thai = 'cho_duyet'
    `);
    await this.repository.query(`
      CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong_gia_han (
        id BIGSERIAL PRIMARY KEY,
        assignment_id BIGINT NOT NULL
          REFERENCES cong_trinh_phan_cong(id) ON DELETE CASCADE,
        ma_nguoi_dung INTEGER NOT NULL
          REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
        den_ngay_moi DATE NOT NULL,
        ly_do TEXT NOT NULL CHECK (length(btrim(ly_do)) BETWEEN 5 AND 2000),
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
          CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
        ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly TIMESTAMP
      )
    `);
    await this.repository.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_gia_han_cho_duyet
      ON cong_trinh_phan_cong_gia_han (assignment_id)
      WHERE trang_thai = 'cho_duyet'
    `);
  }

  findAll(role?: LoginRoleSlug) {
    const roleFilter = role
      ? role === 'quan-tri-vien'
        ? ArrayContains([role])
        : And(ArrayContains([role]), Not(ArrayContains(['quan-tri-vien'])))
      : undefined;
    return this.repository.find({
      ...(roleFilter ? { where: { cong_vai_tro: roleFilter } } : {}),
      select: {
        ma_nguoi_dung: true,
        ten_dang_nhap: true,
        ho_ten: true,
        email: true,
        dia_chi: true,
        so_dien_thoai: true,
        ma_ky_su: true,
        chuyen_nganh: true,
        don_vi_cong_tac: true,
        so_chung_chi_hanh_nghe: true,
        trang_thai: true,
        ngay_tao: true,
        lan_dang_nhap_cuoi: true,
        khu_vuc_duoc_xem: true,
        khu_vuc_phan_cong_ranh_gioi: true,
        khu_vuc_phan_cong_vi_do: true,
        khu_vuc_phan_cong_kinh_do: true,
        khu_vuc_phan_cong_tu_ngay: true,
        khu_vuc_phan_cong_den_ngay: true,
        cong_vai_tro: true,
        duoc_dang_nhap: true,
      },
      order: { ten_dang_nhap: 'ASC' },
    });
  }

  findAllForPortal(role: LoginRoleSlug) {
    return this.repository.find({
      where: { cong_vai_tro: ArrayContains([role]) },
      select: accountProfileSelect,
      order: { ten_dang_nhap: 'ASC' },
    });
  }

  async findAccount(id: number): Promise<NguoiDung> {
    const user = await this.repository.findOne({
      where: { ma_nguoi_dung: id },
      select: accountProfileSelect,
    });
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    return user;
  }

  async findAccountByUsername(username: string): Promise<NguoiDung> {
    const user = await this.findProfileByUsername(username);
    if (!user) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    return user;
  }

  findProfileByUsername(username: string): Promise<NguoiDung | null> {
    return this.repository.findOne({
      where: { ten_dang_nhap: username },
      select: accountProfileSelect,
    });
  }

  async findAvatarPath(userId: number): Promise<string | null> {
    const directory = join(
      process.cwd(),
      'uploads',
      'nguoi-dung',
      String(userId),
    );
    const files = await readdir(directory).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      },
    );
    const avatar = files.find((file) =>
      /^avatar\.(png|jpe?g|webp)$/i.test(file),
    );
    return avatar ? join(directory, avatar) : null;
  }

  async saveAvatar(userId: number, file: UploadedAvatar): Promise<void> {
    const extension = this.getAvatarExtension(file);
    const directory = join(
      process.cwd(),
      'uploads',
      'nguoi-dung',
      String(userId),
    );
    await mkdir(directory, { recursive: true });
    const targetPath = join(directory, `avatar${extension}`);
    await writeFile(targetPath, file.buffer, { flag: 'w' });

    const existingFiles = await readdir(directory);
    await Promise.all(
      existingFiles
        .filter(
          (name) =>
            /^avatar\.(png|jpe?g|webp)$/i.test(name) &&
            name !== `avatar${extension}`,
        )
        .map((name) => unlink(join(directory, name))),
    );
  }

  private getAvatarExtension(file: UploadedAvatar): '.jpg' | '.png' | '.webp' {
    const isPng =
      file.mimetype === 'image/png' &&
      file.buffer.length >= 8 &&
      file.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg =
      file.mimetype === 'image/jpeg' &&
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
    const isWebp =
      file.mimetype === 'image/webp' &&
      file.buffer.length >= 12 &&
      file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
      file.buffer.toString('ascii', 8, 12) === 'WEBP';

    if (isPng) return '.png';
    if (isJpeg) return '.jpg';
    if (isWebp) return '.webp';
    throw new BadRequestException(
      'Ảnh không hợp lệ. Hãy dùng định dạng JPG, PNG hoặc WebP.',
    );
  }

  async findAccess(username: string): Promise<UserAccountAccess | null> {
    const user = await this.repository.findOne({
      where: { ten_dang_nhap: username },
      select: {
        ma_nguoi_dung: true,
        cong_vai_tro: true,
        duoc_dang_nhap: true,
        khu_vuc_phan_cong_tu_ngay: true,
        khu_vuc_phan_cong_den_ngay: true,
      },
    });
    if (!user) return null;
    const assignmentState = (await this.repository.manager.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong
           WHERE ma_nguoi_dung = $1
         ) AS has_assignments,
         EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong
           WHERE ma_nguoi_dung = $1
             AND dang_hieu_luc
             AND COALESCE(
               tu_ngay <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               tu_ngay IS NULL
             )
             AND COALESCE(
               den_ngay >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               den_ngay IS NULL
             )
         ) AS has_active_assignments`,
      [user.ma_nguoi_dung],
    )) as Array<{
      has_assignments: boolean;
      has_active_assignments: boolean;
    }>;
    return {
      ma_nguoi_dung: user.ma_nguoi_dung,
      cong_vai_tro: user.cong_vai_tro,
      duoc_dang_nhap: user.duoc_dang_nhap,
      khu_vuc_phan_cong_tu_ngay: user.khu_vuc_phan_cong_tu_ngay,
      khu_vuc_phan_cong_den_ngay: user.khu_vuc_phan_cong_den_ngay,
      hasProjectAssignments: assignmentState[0]?.has_assignments ?? false,
      hasActiveProjectAssignments:
        assignmentState[0]?.has_active_assignments ?? false,
    };
  }

  async createAccount(input: UserAccountInput): Promise<NguoiDung> {
    if (
      await this.repository.findOneBy({ ten_dang_nhap: input.ten_dang_nhap })
    ) {
      throw new ConflictException('Tên đăng nhập đã tồn tại.');
    }
    if (
      input.email &&
      (await this.repository.findOneBy({ email: input.email }))
    ) {
      throw new ConflictException('Email đã được sử dụng.');
    }
    this.validateRoles(input.cong_vai_tro);
    if (!input.mat_khau) {
      throw new BadRequestException(
        'Vui lòng nhập mật khẩu cho tài khoản mới.',
      );
    }

    const account = this.repository.create({
      ten_dang_nhap: input.ten_dang_nhap,
      ho_ten: input.ho_ten || null,
      email: input.email,
      dia_chi: input.dia_chi,
      so_dien_thoai: input.so_dien_thoai,
      ma_ky_su: input.ma_ky_su,
      chuyen_nganh: input.chuyen_nganh,
      don_vi_cong_tac: input.don_vi_cong_tac,
      so_chung_chi_hanh_nghe: input.so_chung_chi_hanh_nghe,
      trang_thai: input.trang_thai,
      khu_vuc_duoc_xem: input.khu_vuc_duoc_xem,
      khu_vuc_phan_cong_ranh_gioi: input.khu_vuc_phan_cong_ranh_gioi,
      khu_vuc_phan_cong_vi_do: input.khu_vuc_phan_cong_vi_do,
      khu_vuc_phan_cong_kinh_do: input.khu_vuc_phan_cong_kinh_do,
      khu_vuc_phan_cong_tu_ngay: input.khu_vuc_phan_cong_tu_ngay,
      khu_vuc_phan_cong_den_ngay: input.khu_vuc_phan_cong_den_ngay,
      mat_khau: await this.hashPassword(input.mat_khau),
      cong_vai_tro: input.cong_vai_tro,
      duoc_dang_nhap: input.duoc_dang_nhap,
    });
    return this.repository.save(account);
  }

  async registerAccount(
    username: string,
    fullName: string,
    password: string,
    portalRole: LoginRoleSlug,
    profile: SelfRegistrationProfile = {
      email: null,
      dia_chi: null,
      so_dien_thoai: null,
      ma_ky_su: null,
      chuyen_nganh: null,
      don_vi_cong_tac: null,
      so_chung_chi_hanh_nghe: null,
    },
  ): Promise<void> {
    if (portalRole !== 'ky-su' && portalRole !== 'nguoi-xem-ban-do') {
      throw new BadRequestException('Cổng đăng ký không hợp lệ.');
    }
    if (!/^[\p{L}\p{N}._-]{3,100}$/u.test(username)) {
      throw new BadRequestException(
        'Tên đăng nhập cần có 3-100 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.',
      );
    }
    if (!fullName.trim() || fullName.length > 255) {
      throw new BadRequestException(
        'Vui lòng nhập họ tên không quá 255 ký tự.',
      );
    }
    if (password.length < 8 || password.length > 255) {
      throw new BadRequestException('Mật khẩu cần có từ 8 đến 255 ký tự.');
    }
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      throw new BadRequestException('Email không đúng định dạng.');
    }
    const profileLimits: Array<[string, string | null, number]> = [
      ['Email', profile.email, 255],
      ['Địa chỉ', profile.dia_chi, Number.MAX_SAFE_INTEGER],
      ['Số điện thoại', profile.so_dien_thoai, 20],
      ['Mã kỹ sư', profile.ma_ky_su, 50],
      ['Chuyên ngành', profile.chuyen_nganh, 100],
      ['Đơn vị công tác', profile.don_vi_cong_tac, 255],
      ['Số chứng chỉ hành nghề', profile.so_chung_chi_hanh_nghe, 100],
    ];
    for (const [label, value, limit] of profileLimits) {
      if (value && value.length > limit) {
        throw new BadRequestException(`${label} vượt quá độ dài cho phép.`);
      }
    }

    await this.createAccount({
      ten_dang_nhap: username,
      ho_ten: fullName.trim(),
      ...profile,
      trang_thai: 'CHO_DUYET',
      khu_vuc_duoc_xem: null,
      khu_vuc_phan_cong_ranh_gioi: null,
      khu_vuc_phan_cong_vi_do: null,
      khu_vuc_phan_cong_kinh_do: null,
      khu_vuc_phan_cong_tu_ngay: null,
      khu_vuc_phan_cong_den_ngay: null,
      cong_vai_tro: [portalRole],
      duoc_dang_nhap: true,
      mat_khau: password,
    });
  }

  async updateAccount(id: number, input: UserAccountInput): Promise<void> {
    const account = await this.repository.findOneBy({ ma_nguoi_dung: id });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    this.validateRoles(input.cong_vai_tro);
    const duplicate = await this.repository.findOneBy({
      ten_dang_nhap: input.ten_dang_nhap,
    });
    if (duplicate && duplicate.ma_nguoi_dung !== id) {
      throw new ConflictException('Tên đăng nhập đã tồn tại.');
    }
    if (input.email) {
      const duplicateEmail = await this.repository.findOneBy({
        email: input.email,
      });
      if (duplicateEmail && duplicateEmail.ma_nguoi_dung !== id) {
        throw new ConflictException('Email đã được sử dụng.');
      }
    }

    const removesActiveAdmin =
      account.duoc_dang_nhap &&
      account.cong_vai_tro.includes('quan-tri-vien') &&
      (!input.duoc_dang_nhap || !input.cong_vai_tro.includes('quan-tri-vien'));
    if (removesActiveAdmin) {
      await this.ensureAnotherActiveAdmin(id);
    }

    account.ten_dang_nhap = input.ten_dang_nhap;
    account.ho_ten = input.ho_ten || null;
    account.email = input.email;
    account.dia_chi = input.dia_chi;
    account.so_dien_thoai = input.so_dien_thoai;
    account.ma_ky_su = input.ma_ky_su;
    account.chuyen_nganh = input.chuyen_nganh;
    account.don_vi_cong_tac = input.don_vi_cong_tac;
    account.so_chung_chi_hanh_nghe = input.so_chung_chi_hanh_nghe;
    account.trang_thai = input.trang_thai;
    account.khu_vuc_duoc_xem = input.khu_vuc_duoc_xem;
    account.khu_vuc_phan_cong_ranh_gioi = input.khu_vuc_phan_cong_ranh_gioi;
    account.khu_vuc_phan_cong_vi_do = input.khu_vuc_phan_cong_vi_do;
    account.khu_vuc_phan_cong_kinh_do = input.khu_vuc_phan_cong_kinh_do;
    account.khu_vuc_phan_cong_tu_ngay = input.khu_vuc_phan_cong_tu_ngay;
    account.khu_vuc_phan_cong_den_ngay = input.khu_vuc_phan_cong_den_ngay;
    account.cong_vai_tro = input.cong_vai_tro;
    account.duoc_dang_nhap = input.duoc_dang_nhap;
    if (input.mat_khau) {
      account.mat_khau = await this.hashPassword(input.mat_khau);
    }
    await this.repository.save(account);
  }

  async approveAccount(id: number): Promise<void> {
    const account = await this.repository.findOneBy({ ma_nguoi_dung: id });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    account.trang_thai = 'DA_DUYET';
    await this.repository.save(account);
  }

  async updateAreaManagedAccount(
    id: number,
    input: AreaManagedAccountInput,
    managerArea: AreaBounds,
  ): Promise<void> {
    const account = await this.findAreaManagedAccount(id, managerArea);
    this.validateAreaManagedAccountInput(input);
    if (input.email) {
      const duplicateEmail = await this.repository.findOneBy({
        email: input.email,
      });
      if (duplicateEmail && duplicateEmail.ma_nguoi_dung !== id) {
        throw new ConflictException('Email đã được sử dụng.');
      }
    }

    account.ho_ten = input.ho_ten || null;
    account.email = input.email;
    account.dia_chi = input.dia_chi;
    account.so_dien_thoai = input.so_dien_thoai;
    account.ma_ky_su = input.ma_ky_su;
    account.chuyen_nganh = input.chuyen_nganh;
    account.don_vi_cong_tac = input.don_vi_cong_tac;
    account.so_chung_chi_hanh_nghe = input.so_chung_chi_hanh_nghe;
    account.trang_thai = input.trang_thai;
    account.duoc_dang_nhap = input.duoc_dang_nhap;
    if (input.mat_khau) {
      account.mat_khau = await this.hashPassword(input.mat_khau);
    }
    await this.repository.save(account);
  }

  async assignEngineerAreaFromProjects(
    userId: number,
    areaName: string,
    geometry: AreaGeometry,
    latitude: number,
    longitude: number,
    assignments: EngineerProjectAssignmentInput[],
  ): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      const account = await manager.findOne(NguoiDung, {
        where: { ma_nguoi_dung: userId },
      });
      if (
        !account ||
        !account.cong_vai_tro.includes('ky-su') ||
        !account.duoc_dang_nhap ||
        account.cong_vai_tro.includes('quan-tri-vien') ||
        account.cong_vai_tro.includes('quan-ly-khu-vuc')
      ) {
        throw new NotFoundException(
          'Không tìm thấy tài khoản Kỹ sư được phân bổ.',
        );
      }
      account.khu_vuc_duoc_xem = areaName;
      account.khu_vuc_phan_cong_ranh_gioi = geometry;
      account.khu_vuc_phan_cong_vi_do = latitude;
      account.khu_vuc_phan_cong_kinh_do = longitude;
      account.khu_vuc_phan_cong_tu_ngay = null;
      account.khu_vuc_phan_cong_den_ngay = null;
      await manager.save(account);

      for (const assignment of assignments) {
        await manager.query(
          `UPDATE cong_trinh_phan_cong
           SET dang_hieu_luc = FALSE, ngay_cap_nhat = CURRENT_TIMESTAMP
           WHERE cong_trinh_id = $1 AND dang_hieu_luc`,
          [assignment.projectId],
        );
        await manager.query(
          `INSERT INTO cong_trinh_phan_cong (
             ma_nguoi_dung, cong_trinh_id, tu_ngay, den_ngay, khu_vuc,
             ranh_gioi, vi_do, kinh_do, da_hoan_thanh, dang_hieu_luc,
             trang_thai_phan_bo
           ) VALUES ($1, $2, $3::date, $4::date, $5, $6::jsonb, $7, $8, FALSE, TRUE, 'da_phan_bo')`,
          [
            userId,
            assignment.projectId,
            assignment.startDate,
            assignment.endDate,
            assignment.areaName,
            JSON.stringify(assignment.geometry),
            assignment.latitude,
            assignment.longitude,
          ],
        );
      }
    });
  }

  async findEngineerAllocationSummaries() {
    const rows = (await this.repository.manager.query(
      `SELECT
         u.ma_nguoi_dung,
         u.ten_dang_nhap,
         u.ho_ten,
         u.khu_vuc_duoc_xem,
         COUNT(a.id) FILTER (
           WHERE a.dang_hieu_luc
             AND NOT a.da_hoan_thanh
             AND COALESCE(
               a.tu_ngay <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               a.tu_ngay IS NULL
             )
             AND COALESCE(
               a.den_ngay >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               a.den_ngay IS NULL
             )
         )::integer AS assigned_count,
         COUNT(a.id) FILTER (
           WHERE a.dang_hieu_luc
             AND a.trang_thai_phan_bo = 'da_phan_bo'
         )::integer AS allocated_count,
         COUNT(a.id) FILTER (WHERE a.da_hoan_thanh)::integer AS completed_count,
         CASE
           WHEN BOOL_OR(a.id IS NOT NULL) THEN COALESCE(
             STRING_AGG(DISTINCT a.khu_vuc, '; ') FILTER (
             WHERE a.dang_hieu_luc
               AND COALESCE(
                 a.tu_ngay <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                 a.tu_ngay IS NULL
               )
               AND COALESCE(
                 a.den_ngay >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
                 a.den_ngay IS NULL
               )
             ),
             'Chưa có khu vực đang hiệu lực'
           )
           ELSE COALESCE(u.khu_vuc_duoc_xem, 'Chưa phân công')
         END AS current_area
       FROM nguoi_dung u
       LEFT JOIN cong_trinh_phan_cong a
         ON a.ma_nguoi_dung = u.ma_nguoi_dung
       WHERE u.duoc_dang_nhap
         AND u.cong_vai_tro @> ARRAY['ky-su']::varchar(32)[]
         AND NOT (u.cong_vai_tro @> ARRAY['quan-tri-vien']::varchar(32)[])
         AND NOT (u.cong_vai_tro @> ARRAY['quan-ly-khu-vuc']::varchar(32)[])
       GROUP BY u.ma_nguoi_dung, u.ten_dang_nhap, u.ho_ten, u.khu_vuc_duoc_xem
       ORDER BY u.ho_ten NULLS LAST, u.ten_dang_nhap`,
    )) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const assignedCount = Number(row.assigned_count);
      const allocatedCount = Number(row.allocated_count);
      const completedCount = Number(row.completed_count);
      const total = assignedCount + completedCount;
      return {
        ...row,
        assigned_count: assignedCount,
        allocated_count: allocatedCount,
        allocation_status: allocatedCount > 0 ? 'da_phan_bo' : 'chua_phan_bo',
        completed_count: completedCount,
        completion_rate:
          total === 0 ? 0 : Math.round((completedCount / total) * 100),
      };
    });
  }

  async findProjectAllocationStatuses() {
    return this.repository.manager.query(
      `SELECT DISTINCT ON (a.cong_trinh_id)
         a.cong_trinh_id,
         a.tu_ngay,
         a.den_ngay,
         a.da_hoan_thanh,
         u.ho_ten AS engineer_name,
         u.ten_dang_nhap AS engineer_username,
         cancellation.trang_thai AS cancellation_status,
         CASE
           WHEN cancellation.trang_thai = 'cho_duyet' THEN 'pending_cancellation'
           WHEN a.den_ngay < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN 'overdue'
           ELSE 'assigned'
         END AS allocation_status
       FROM cong_trinh_phan_cong a
       JOIN nguoi_dung u ON u.ma_nguoi_dung = a.ma_nguoi_dung
       LEFT JOIN LATERAL (
         SELECT r.trang_thai
         FROM cong_trinh_phan_cong_huy r
         WHERE r.assignment_id = a.id
         ORDER BY r.id DESC
         LIMIT 1
       ) cancellation ON TRUE
       WHERE a.dang_hieu_luc
         AND a.trang_thai_phan_bo = 'da_phan_bo'
         AND cancellation.trang_thai IS DISTINCT FROM 'da_duyet'
       ORDER BY a.cong_trinh_id, a.id DESC`,
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async findEngineerProjectAssignments(userId: number) {
    return this.repository.manager.query(
      `SELECT
         a.id,
         a.cong_trinh_id,
         c.ten_cong_trinh,
         c.dia_diem,
         a.tu_ngay,
         a.den_ngay,
         a.khu_vuc,
         a.trang_thai_phan_bo,
         a.da_hoan_thanh,
         a.dang_hieu_luc,
         cancellation.trang_thai AS cancellation_status
       FROM cong_trinh_phan_cong a
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       LEFT JOIN LATERAL (
         SELECT r.trang_thai
         FROM cong_trinh_phan_cong_huy r
         WHERE r.assignment_id = a.id
         ORDER BY r.id DESC
         LIMIT 1
       ) cancellation ON TRUE
       WHERE a.ma_nguoi_dung = $1
       ORDER BY a.dang_hieu_luc DESC, a.da_hoan_thanh, a.den_ngay DESC, c.id`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async findEngineerAssignmentHistory(userId: number) {
    return this.repository.manager.query(
      `SELECT
         a.id AS assignment_id,
         a.cong_trinh_id,
         c.ten_cong_trinh,
         c.dia_diem,
         a.tu_ngay,
         a.den_ngay,
         a.khu_vuc,
         a.da_hoan_thanh,
         a.dang_hieu_luc,
         request.id AS cancellation_request_id,
         request.ly_do AS cancellation_reason,
         request.trang_thai AS cancellation_status,
         renewal.id AS renewal_request_id,
         renewal.den_ngay_moi AS renewal_new_end_date,
         renewal.trang_thai AS renewal_status,
         CASE
           WHEN a.da_hoan_thanh THEN 'completed'
           WHEN a.dang_hieu_luc
             AND COALESCE(
               a.tu_ngay <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               a.tu_ngay IS NULL
             )
             AND COALESCE(
               a.den_ngay >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
               a.den_ngay IS NULL
             ) THEN 'in_progress'
           ELSE 'unfinished'
         END AS history_status
       FROM cong_trinh_phan_cong a
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       LEFT JOIN LATERAL (
         SELECT r.id, r.ly_do, r.trang_thai
         FROM cong_trinh_phan_cong_huy r
         WHERE r.assignment_id = a.id
         ORDER BY r.id DESC
         LIMIT 1
       ) request ON TRUE
       LEFT JOIN LATERAL (
         SELECT r.id, r.den_ngay_moi, r.trang_thai
         FROM cong_trinh_phan_cong_gia_han r
         WHERE r.assignment_id = a.id
         ORDER BY r.id DESC
         LIMIT 1
       ) renewal ON TRUE
       WHERE a.ma_nguoi_dung = $1
       ORDER BY a.ngay_tao DESC, a.id DESC`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async submitEngineerAssignmentRenewalRequest(
    userId: number,
    assignmentId: number,
    newEndDate: string,
    reason: string,
  ): Promise<void> {
    const rows = (await this.repository.manager.query(
      `INSERT INTO cong_trinh_phan_cong_gia_han (
         assignment_id, ma_nguoi_dung, den_ngay_moi, ly_do
       )
       SELECT a.id, a.ma_nguoi_dung, $3::date, $4
       FROM cong_trinh_phan_cong a
       WHERE a.id = $1
         AND a.ma_nguoi_dung = $2
         AND a.dang_hieu_luc
         AND NOT a.da_hoan_thanh
         AND a.den_ngay IS NOT NULL
         AND $3::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
         AND $3::date > a.den_ngay
         AND NOT EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong_huy cancellation
           WHERE cancellation.assignment_id = a.id
             AND cancellation.trang_thai = 'cho_duyet'
         )
       ON CONFLICT (assignment_id) WHERE trang_thai = 'cho_duyet'
       DO NOTHING
       RETURNING id`,
      [assignmentId, userId, newEndDate, reason.trim()],
    )) as Array<{ id: number }>;
    if (rows.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy phân công đủ điều kiện gia hạn hoặc đã có yêu cầu chờ duyệt.',
      );
    }
  }

  findPendingEngineerAssignmentRenewalRequests() {
    return this.repository.manager.query(
      `SELECT r.id, r.assignment_id, r.ma_nguoi_dung, r.den_ngay_moi,
              r.ly_do, r.ngay_tao, u.ten_dang_nhap, u.ho_ten,
              a.cong_trinh_id, a.den_ngay AS den_ngay_hien_tai,
              c.ten_cong_trinh, a.khu_vuc
       FROM cong_trinh_phan_cong_gia_han r
       JOIN cong_trinh_phan_cong a ON a.id = r.assignment_id
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       JOIN nguoi_dung u ON u.ma_nguoi_dung = r.ma_nguoi_dung
       WHERE r.trang_thai = 'cho_duyet'
       ORDER BY r.ngay_tao, r.id`,
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async approveEngineerAssignmentRenewalRequest(
    requestId: number,
  ): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      const [request] = (await manager.query(
        `SELECT id, assignment_id, ma_nguoi_dung, den_ngay_moi
         FROM cong_trinh_phan_cong_gia_han
         WHERE id = $1 AND trang_thai = 'cho_duyet'
         FOR UPDATE`,
        [requestId],
      )) as Array<{
        id: number;
        assignment_id: number;
        ma_nguoi_dung: number;
        den_ngay_moi: string;
      }>;
      if (!request) {
        throw new NotFoundException(
          'Không tìm thấy yêu cầu gia hạn đang chờ duyệt.',
        );
      }
      await manager.query(
        `UPDATE cong_trinh_phan_cong
         SET den_ngay = $2::date, ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [request.assignment_id, request.den_ngay_moi],
      );
      await manager.query(
        `UPDATE cong_trinh_phan_cong_gia_han
         SET trang_thai = 'da_duyet', ngay_xu_ly = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId],
      );
    });
  }

  async findCancelableEngineerAssignments(userId: number) {
    return this.repository.manager.query(
      `SELECT a.id AS assignment_id, a.cong_trinh_id, c.ten_cong_trinh,
              a.khu_vuc, a.tu_ngay, a.den_ngay
       FROM cong_trinh_phan_cong a
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       WHERE a.ma_nguoi_dung = $1
         AND a.dang_hieu_luc
         AND NOT a.da_hoan_thanh
         AND NOT EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong_huy r
           WHERE r.assignment_id = a.id AND r.trang_thai = 'cho_duyet'
         )
       ORDER BY a.den_ngay NULLS LAST, a.id`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async findEngineerCancellationRequests(userId: number) {
    return this.repository.manager.query(
      `SELECT r.id, r.assignment_id, r.ly_do, r.trang_thai, r.ngay_tao,
              c.id AS cong_trinh_id, c.ten_cong_trinh
       FROM cong_trinh_phan_cong_huy r
       JOIN cong_trinh_phan_cong a ON a.id = r.assignment_id
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       WHERE r.ma_nguoi_dung = $1
       ORDER BY r.ngay_tao DESC, r.id DESC`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async findMyPendingEngineerCancellationRequests(userId: number) {
    return this.repository.manager.query(
      `SELECT r.id, r.assignment_id, r.ly_do, r.ngay_tao,
              c.id AS cong_trinh_id, c.ten_cong_trinh, c.dia_diem
       FROM cong_trinh_phan_cong_huy r
       JOIN cong_trinh_phan_cong a ON a.id = r.assignment_id
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       WHERE r.ma_nguoi_dung = $1
         AND r.trang_thai = 'cho_duyet'
       ORDER BY r.ngay_tao DESC, r.id DESC`,
      [userId],
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async submitEngineerCancellationRequest(
    userId: number,
    assignmentId: number,
    reason: string,
  ): Promise<void> {
    const rows = await this.repository.manager.query(
      `INSERT INTO cong_trinh_phan_cong_huy (
         assignment_id, ma_nguoi_dung, ly_do
       )
       SELECT a.id, a.ma_nguoi_dung, $3
       FROM cong_trinh_phan_cong a
       WHERE a.id = $1
         AND a.ma_nguoi_dung = $2
         AND a.dang_hieu_luc
         AND NOT a.da_hoan_thanh
         AND NOT EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong_huy r
           WHERE r.assignment_id = a.id AND r.trang_thai = 'cho_duyet'
         )
       ON CONFLICT (assignment_id) WHERE trang_thai = 'cho_duyet'
       DO NOTHING
       RETURNING id`,
      [assignmentId, userId, reason.trim()],
    ) as Array<{ id: number }>;
    if (rows.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy phân công đang thực hiện hoặc đã có đơn hủy chờ duyệt.',
      );
    }
  }

  findPendingEngineerCancellationRequests() {
    return this.repository.manager.query(
      `SELECT r.id, r.assignment_id, r.ma_nguoi_dung, r.ly_do, r.ngay_tao,
              u.ten_dang_nhap, u.ho_ten,
              a.cong_trinh_id, c.ten_cong_trinh, a.khu_vuc
       FROM cong_trinh_phan_cong_huy r
       JOIN cong_trinh_phan_cong a ON a.id = r.assignment_id
       JOIN cong_trinh c ON c.id = a.cong_trinh_id
       JOIN nguoi_dung u ON u.ma_nguoi_dung = r.ma_nguoi_dung
       WHERE r.trang_thai = 'cho_duyet'
       ORDER BY r.ngay_tao, r.id`,
    ) as Promise<Array<Record<string, unknown>>>;
  }

  async approveEngineerCancellationRequest(requestId: number): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      const [request] = (await manager.query(
        `SELECT id, assignment_id, ma_nguoi_dung
         FROM cong_trinh_phan_cong_huy
         WHERE id = $1 AND trang_thai = 'cho_duyet'
         FOR UPDATE`,
        [requestId],
      )) as Array<{
        id: number;
        assignment_id: number;
        ma_nguoi_dung: number;
      }>;
      if (!request) {
        throw new NotFoundException(
          'Không tìm thấy đơn hủy đang chờ duyệt.',
        );
      }
      await manager.query(
        `UPDATE cong_trinh_phan_cong
         SET dang_hieu_luc = FALSE,
             trang_thai_phan_bo = 'chua_phan_bo',
             ngay_cap_nhat = CURRENT_TIMESTAMP
         WHERE id = $1 AND ma_nguoi_dung = $2`,
        [request.assignment_id, request.ma_nguoi_dung],
      );
      await manager.query(
        `UPDATE cong_trinh_phan_cong_huy
         SET trang_thai = 'da_duyet', ngay_xu_ly = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [requestId],
      );
    });
  }

  async findProjectAssignmentAccess(userId: number): Promise<{
    hasAssignments: boolean;
    activeProjectIds: number[];
    activeAreaName: string | null;
    activeGeometry: AreaGeometry | null;
    activeLatitude: number | null;
    activeLongitude: number | null;
  }> {
    const [result] = (await this.repository.manager.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM cong_trinh_phan_cong
           WHERE ma_nguoi_dung = $1
         ) AS has_assignments,
         COALESCE(
           ARRAY_AGG(cong_trinh_id ORDER BY id) FILTER (
             WHERE dang_hieu_luc
           ),
           ARRAY[]::integer[]
         ) AS active_project_ids,
         COALESCE(
           JSONB_AGG(ranh_gioi ORDER BY id) FILTER (
             WHERE dang_hieu_luc
           ),
           '[]'::jsonb
         ) AS active_geometries,
         COALESCE(
           ARRAY_AGG(khu_vuc ORDER BY id) FILTER (
             WHERE dang_hieu_luc
           ),
           ARRAY[]::text[]
         ) AS active_area_names,
         (ARRAY_AGG(vi_do ORDER BY id) FILTER (
           WHERE dang_hieu_luc
         ))[1] AS active_latitude,
         (ARRAY_AGG(kinh_do ORDER BY id) FILTER (
           WHERE dang_hieu_luc
         ))[1] AS active_longitude
       FROM cong_trinh_phan_cong
       WHERE ma_nguoi_dung = $1`,
      [userId],
    )) as [
      {
        has_assignments: boolean;
        active_project_ids: number[] | string[];
        active_geometries: AreaGeometry[];
        active_area_names: string[];
        active_latitude: number | null;
        active_longitude: number | null;
      },
    ];
    const uniqueGeometries = new Map(
      result.active_geometries.map((geometry) => [
        JSON.stringify(geometry),
        geometry,
      ]),
    );
    const polygons = [...uniqueGeometries.values()].flatMap((geometry) =>
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates,
    );
    const activeGeometry: AreaGeometry | null =
      polygons.length === 0
        ? null
        : polygons.length === 1
          ? { type: 'Polygon', coordinates: polygons[0] }
          : { type: 'MultiPolygon', coordinates: polygons };
    return {
      hasAssignments: result.has_assignments,
      activeProjectIds: result.active_project_ids.map(Number),
      activeAreaName: [...new Set(result.active_area_names)].join('; ') || null,
      activeGeometry,
      activeLatitude:
        result.active_latitude === null ? null : Number(result.active_latitude),
      activeLongitude:
        result.active_longitude === null
          ? null
          : Number(result.active_longitude),
    };
  }

  async findAssignedProjectIds(userId: number): Promise<number[]> {
    const assignmentAccess = await this.findProjectAssignmentAccess(userId);
    if (assignmentAccess.hasAssignments) {
      return assignmentAccess.activeProjectIds;
    }

    const account = await this.findAccount(userId);
    const geometry = account.khu_vuc_phan_cong_ranh_gioi;
    if (!geometry) return [];

    const rows = await this.repository.manager.query(
      `SELECT DISTINCT cong_trinh_id
       FROM (
         SELECT h.cong_trinh_id
         FROM ho_khoan h
         WHERE h.latitude IS NOT NULL AND h.longitude IS NOT NULL
           AND ST_Covers(
             ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1::json), 4326)),
             ST_SetSRID(
               ST_MakePoint(h.longitude::double precision, h.latitude::double precision),
               4326
             )
           )
         UNION
         SELECT m.cong_trinh_id
         FROM mat_bang m
         WHERE m.ranh_gioi IS NOT NULL
           AND ST_Intersects(
             ST_MakeValid(m.ranh_gioi),
             ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1::json), 4326))
           )
       ) assigned_projects
       WHERE cong_trinh_id IS NOT NULL`,
      [JSON.stringify(geometry)],
    ) as Array<{ cong_trinh_id: number | string }>;
    return rows.map((row) => Number(row.cong_trinh_id));
  }

  async setEngineerProjectCompleted(
    assignmentId: number,
    completed: boolean,
  ): Promise<void> {
    const result = await this.repository.manager.query(
      `UPDATE cong_trinh_phan_cong
       SET da_hoan_thanh = $2, ngay_cap_nhat = CURRENT_TIMESTAMP
      WHERE id = $1
       RETURNING id`,
      [assignmentId, completed],
    );
    if (result.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy công trình đang được bổ nhiệm.',
      );
    }
  }

  async deleteAreaManagedAccount(
    id: number,
    managerArea: AreaBounds,
  ): Promise<void> {
    const account = await this.findAreaManagedAccount(id, managerArea);
    await this.repository.remove(account);
  }

  private async findAreaManagedAccount(
    id: number,
    managerArea: AreaBounds,
  ): Promise<NguoiDung> {
    const account = await this.repository.findOneBy({
      ma_nguoi_dung: id,
    });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    const hasManagedRole = account.cong_vai_tro.some(
      (role) => role === 'ky-su' || role === 'nguoi-xem-ban-do',
    );
    if (
      !hasManagedRole ||
      account.cong_vai_tro.includes('quan-tri-vien') ||
      account.cong_vai_tro.includes('quan-ly-khu-vuc') ||
      !isWithinAssignedArea(
        managerArea,
        account.khu_vuc_phan_cong_vi_do,
        account.khu_vuc_phan_cong_kinh_do,
      )
    ) {
      throw new NotFoundException('Không tìm thấy tài khoản trong khu vực.');
    }
    return account;
  }

  private validateAreaManagedAccountInput(
    input: AreaManagedAccountInput,
  ): void {
    if (!input.ho_ten.trim() || input.ho_ten.length > 255) {
      throw new BadRequestException(
        'Vui lòng nhập họ tên không quá 255 ký tự.',
      );
    }
    if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new BadRequestException('Email không đúng định dạng.');
    }
    const limitedFields: Array<[string, string | null, number]> = [
      ['Email', input.email, 255],
      ['Địa chỉ', input.dia_chi, Number.MAX_SAFE_INTEGER],
      ['Số điện thoại', input.so_dien_thoai, 20],
      ['Mã kỹ sư', input.ma_ky_su, 50],
      ['Chuyên ngành', input.chuyen_nganh, 100],
      ['Đơn vị công tác', input.don_vi_cong_tac, 255],
      ['Số chứng chỉ hành nghề', input.so_chung_chi_hanh_nghe, 100],
    ];
    for (const [label, value, limit] of limitedFields) {
      if (value && value.length > limit) {
        throw new BadRequestException(`${label} vượt quá độ dài cho phép.`);
      }
    }
    if (!['CHO_DUYET', 'DA_DUYET', 'TU_CHOI'].includes(input.trang_thai)) {
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ.');
    }
    if (
      input.mat_khau &&
      (input.mat_khau.length < 8 || input.mat_khau.length > 255)
    ) {
      throw new BadRequestException('Mật khẩu mới cần dài từ 8-255 ký tự.');
    }
  }

  async deleteAccount(id: number): Promise<void> {
    const account = await this.repository.findOneBy({ ma_nguoi_dung: id });
    if (!account) {
      throw new NotFoundException('Không tìm thấy tài khoản.');
    }
    if (
      account.duoc_dang_nhap &&
      account.cong_vai_tro.includes('quan-tri-vien')
    ) {
      await this.ensureAnotherActiveAdmin(id);
    }
    await this.repository.remove(account);
  }

  async verifyCredentials(
    username: string,
    password: string,
    portalRole: LoginRoleSlug,
  ): Promise<boolean> {
    const user = await this.repository
      .createQueryBuilder('user')
      .addSelect('user.mat_khau')
      .where('user.ten_dang_nhap = :username', { username })
      .getOne();

    if (
      !user ||
      !user.duoc_dang_nhap ||
      !user.cong_vai_tro.includes(portalRole)
    ) {
      return false;
    }

    const isHashedPassword = user.mat_khau.startsWith('scrypt$');
    const matches = isHashedPassword
      ? await this.verifyHashedPassword(password, user.mat_khau)
      : (() => {
          const storedPassword = Buffer.from(user.mat_khau);
          const submittedPassword = Buffer.from(password);
          return (
            storedPassword.length === submittedPassword.length &&
            timingSafeEqual(storedPassword, submittedPassword)
          );
        })();

    if (matches) {
      const update: Partial<NguoiDung> = {
        lan_dang_nhap_cuoi: new Date(),
      };
      if (!isHashedPassword) {
        update.mat_khau = await this.hashPassword(password);
      }
      await this.repository.update(user.ma_nguoi_dung, update);
    }

    return matches;
  }

  private async verifyHashedPassword(
    password: string,
    encodedPassword: string,
  ): Promise<boolean> {
    const [, encodedSalt, encodedHash, extra] = encodedPassword.split('$');
    if (!encodedSalt || !encodedHash || extra !== undefined) {
      return false;
    }

    const salt = Buffer.from(encodedSalt, 'base64url');
    const expectedHash = Buffer.from(encodedHash, 'base64url');
    if (salt.length !== 16 || expectedHash.length !== 64) {
      return false;
    }
    const actualHash = await this.derivePassword(password, salt);

    return (
      expectedHash.length === actualHash.length &&
      timingSafeEqual(expectedHash, actualHash)
    );
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await this.derivePassword(password, salt);
    return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }

  private validateRoles(roles: LoginRoleSlug[]): void {
    const allowedRoles = new Set<string>([
      'ky-su',
      'quan-tri-vien',
      'quan-ly-khu-vuc',
      'nguoi-xem-ban-do',
    ]);
    if (
      !Array.isArray(roles) ||
      roles.length === 0 ||
      roles.some((role) => !allowedRoles.has(role))
    ) {
      throw new BadRequestException('Chọn ít nhất một cổng đăng nhập hợp lệ.');
    }
  }

  private async ensureAnotherActiveAdmin(excludedId: number): Promise<void> {
    const otherAdmins = await this.repository
      .createQueryBuilder('user')
      .where(':role = ANY(user.cong_vai_tro)', {
        role: 'quan-tri-vien',
      })
      .andWhere('user.duoc_dang_nhap = true')
      .andWhere('user.ma_nguoi_dung != :excludedId', { excludedId })
      .getCount();

    if (otherAdmins === 0) {
      throw new BadRequestException(
        'Không thể vô hiệu hóa, xóa hoặc hạ quyền Quản trị viên cuối cùng.',
      );
    }
  }

  private derivePassword(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      });
    });
  }
}
