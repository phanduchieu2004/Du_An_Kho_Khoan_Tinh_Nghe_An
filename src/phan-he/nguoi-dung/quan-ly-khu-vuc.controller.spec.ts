import { NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { QuanLyKhuVucController } from './quan-ly-khu-vuc.controller.js';

describe('QuanLyKhuVucController', () => {
  const manager = {
    ten_dang_nhap: 'manager01',
    cong_vai_tro: ['quan-ly-khu-vuc'],
    khu_vuc_duoc_xem: 'Khu vực mẫu',
    khu_vuc_phan_cong_ranh_gioi: {
      type: 'Polygon',
      coordinates: [[[101, 10], [103, 10], [103, 12], [101, 12], [101, 10]]],
    },
  };
  const accountInArea = {
    ma_nguoi_dung: 2,
    cong_vai_tro: ['ky-su'],
    khu_vuc_phan_cong_vi_do: 11,
    khu_vuc_phan_cong_kinh_do: 102,
  };
  const users = {
    findAccountByUsername: vi.fn(),
    findAll: vi.fn(),
    findAccount: vi.fn(),
    updateAreaManagedAccount: vi.fn(),
    deleteAreaManagedAccount: vi.fn(),
  };
  let controller: QuanLyKhuVucController;

  beforeEach(() => {
    vi.clearAllMocks();
    users.findAccountByUsername.mockResolvedValue(manager);
    users.findAll.mockResolvedValue([
      accountInArea,
      {
        ma_nguoi_dung: 3,
        cong_vai_tro: ['nguoi-xem-ban-do'],
        khu_vuc_phan_cong_vi_do: 20,
        khu_vuc_phan_cong_kinh_do: 105,
      },
      {
        ma_nguoi_dung: 4,
        cong_vai_tro: ['quan-tri-vien'],
        khu_vuc_phan_cong_vi_do: 11,
        khu_vuc_phan_cong_kinh_do: 102,
      },
      {
        ma_nguoi_dung: 5,
        cong_vai_tro: ['ky-su'],
        khu_vuc_phan_cong_vi_do: null,
        khu_vuc_phan_cong_kinh_do: null,
      },
    ]);
    controller = new QuanLyKhuVucController(users as never);
  });

  function request(): Request {
    return { authSession: { username: 'manager01' } } as Request;
  }

  it('lists only engineer and map viewer accounts pinned inside the manager boundary', async () => {
    const result = await controller.index(request());

    expect(result.accounts.map(({ ma_nguoi_dung }) => ma_nguoi_dung)).toEqual([
      2,
    ]);
  });

  it('prevents managers from opening accounts outside their boundary', async () => {
    users.findAccount.mockResolvedValue({
      ma_nguoi_dung: 3,
      cong_vai_tro: ['nguoi-xem-ban-do'],
      khu_vuc_phan_cong_vi_do: 20,
      khu_vuc_phan_cong_kinh_do: 105,
    });

    await expect(
      controller.accountDetails(3, request()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not expose role or assigned-area fields in manager updates', async () => {
    users.findAccount.mockResolvedValue(accountInArea);
    const response = { redirect: vi.fn() };

    await controller.updateAccount(
      2,
      {
        ho_ten: 'Kỹ sư mới',
        trang_thai: 'DA_DUYET',
        cong_vai_tro: ['quan-tri-vien'],
        khu_vuc_phan_cong_vi_do: '20',
      },
      request(),
      response as never,
    );

    const updateInput = users.updateAreaManagedAccount.mock.calls[0][1];
    expect(updateInput).not.toHaveProperty('cong_vai_tro');
    expect(updateInput).not.toHaveProperty('khu_vuc_phan_cong_vi_do');
    expect(users.updateAreaManagedAccount).toHaveBeenCalledWith(
      2,
      updateInput,
      expect.objectContaining({ south: 10, north: 12, west: 101, east: 103 }),
    );
    expect(response.redirect).toHaveBeenCalledWith('/quan-ly-khu-vuc');
  });
});
