import type { Repository } from 'typeorm';
import { NguoiDung } from '../nguoi-dung/thuc-the/nguoi-dung.entity.js';
import { HoTroService } from './ho-tro.service.js';

describe('HoTroService', () => {
  const query = vi.fn();
  const transaction = vi.fn();
  const repository = {
    query: vi.fn(),
    manager: { query, transaction },
  };
  let service: HoTroService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository.query.mockResolvedValue([]);
    query.mockResolvedValue([]);
    transaction.mockImplementation(
      (callback: (manager: { query: typeof query }) => Promise<unknown>) =>
        callback({ query }),
    );
    service = new HoTroService(repository as unknown as Repository<NguoiDung>);
  });

  it('creates persistent support tables and indexes on startup', async () => {
    await service.onModuleInit();

    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS ho_tro_yeu_cau'),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS ho_tro_tin_nhan'),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('ho_tro_yeu_cau_engineer_updated'),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS ho_tro_admin_da_doc'),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS ho_tro_tai_khoan_da_doc'),
    );
    expect(repository.query).toHaveBeenCalledWith(
      expect.stringContaining('CREATE UNIQUE INDEX IF NOT EXISTS ho_tro_tin_nhan_direct_pair'),
    );
  });

  it('loads conversations only for the signed-in engineer', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 7,
          ten_dang_nhap: 'engineer7',
          ho_ten: 'Kỹ sư',
          email: 'engineer@example.com',
        },
      ])
      .mockResolvedValueOnce([{ id: 11, messages: [] }]);

    await expect(service.listEngineerConversations('engineer7')).resolves.toMatchObject({
      account: { ma_nguoi_dung: 7, email: 'engineer@example.com' },
      conversations: [{ id: 11 }],
    });
    expect(query.mock.calls[1][1]).toEqual([7]);
    expect(query.mock.calls[1][0]).toContain(
      "c.loai_hoi_thoai = 'admin' AND c.engineer_id = $1",
    );
    expect(query.mock.calls[1][0]).toContain(
      "c.loai_hoi_thoai = 'ky-su' AND $1 IN (c.engineer_id, c.recipient_id)",
    );
  });

  it('keeps existing support conversations visible when the account has no email', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 7,
          ten_dang_nhap: 'engineer7',
          ho_ten: 'Kỹ sư',
          email: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 11, messages: [] }]);

    await expect(
      service.listEngineerConversations('engineer7'),
    ).resolves.toMatchObject({ conversations: [{ id: 11 }] });
  });

  it('lists admin conversations by latest message and computes unread state per admin', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 2,
          ten_dang_nhap: 'admin',
          ho_ten: 'Quản trị',
          email: 'admin@example.com',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 21,
          engineer_name: 'Kỹ sư',
          latest_message: 'Cần hỗ trợ',
          unread: true,
        },
      ]);

    await expect(service.listAdminConversations('admin')).resolves.toMatchObject({
      conversations: [{ id: 21, latest_message: 'Cần hỗ trợ', unread: true }],
      selectedConversation: null,
    });
    expect(query.mock.calls[1][0]).toContain('ho_tro_admin_da_doc');
    expect(query.mock.calls[1][0]).toContain("incoming.sender_role = 'ky-su'");
    expect(query.mock.calls[1][0]).toContain('u.cong_vai_tro AS engineer_roles');
    expect(query.mock.calls[1][0]).toContain('ORDER BY sort_time DESC, c.id DESC');
    expect(query.mock.calls[1][1]).toEqual([2]);
  });

  it('marks a selected admin conversation read and loads only that thread', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 2,
          ten_dang_nhap: 'admin',
          ho_ten: 'Quản trị',
          email: 'admin@example.com',
        },
      ])
      .mockResolvedValueOnce([{ id: 21 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 21, unread: false }])
      .mockResolvedValueOnce([{ id: 21, messages: [] }]);

    await expect(service.listAdminConversations('admin', 21)).resolves.toMatchObject({
      conversations: [{ id: 21, unread: false }],
      selectedConversation: { id: 21, messages: [] },
    });
    expect(query.mock.calls[2][0]).toContain('last_read_message_id');
    expect(query.mock.calls[2][0]).toContain('ON CONFLICT (admin_id, yeu_cau_id)');
    expect(query.mock.calls[2][1]).toEqual([2, 21]);
    expect(query.mock.calls[4][1]).toEqual([21]);
  });

  it('does not mark an unknown admin conversation as read', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 2,
          ten_dang_nhap: 'admin',
          ho_ten: 'Quản trị',
          email: 'admin@example.com',
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.listAdminConversations('admin', 999)).rejects.toThrow(
      'Không tìm thấy hội thoại hỗ trợ.',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('stores the engineer account and Gmail with the initial support message', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 7,
          ten_dang_nhap: 'engineer7',
          ho_ten: 'Kỹ sư',
          email: 'engineer@example.com',
        },
      ])
      .mockResolvedValueOnce([{ id: 15 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.createEngineerConversation(
        'engineer7',
        'Không mở được công trình',
        'Xin admin kiểm tra quyền truy cập giúp tôi.',
      ),
    ).resolves.toBe(15);
    expect(transaction).toHaveBeenCalledOnce();
    expect(query.mock.calls[1][1]).toEqual([7, 'Không mở được công trình']);
    expect(query.mock.calls[2][1]).toEqual([
      15,
      7,
      'Kỹ sư',
      'engineer@example.com',
      'Xin admin kiểm tra quyền truy cập giúp tôi.',
    ]);
  });

  it('requires an engineer Gmail before creating a support conversation', async () => {
    query.mockResolvedValueOnce([
      {
        ma_nguoi_dung: 7,
        ten_dang_nhap: 'engineer7',
        ho_ten: 'Kỹ sư',
        email: null,
      },
    ]);

    await expect(
      service.createEngineerConversation('engineer7', 'Hỗ trợ', 'Nội dung'),
    ).rejects.toThrow('chưa có Gmail');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not allow an engineer to reply to another engineer support request', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 8,
          ten_dang_nhap: 'engineer8',
          ho_ten: 'Kỹ sư khác',
          email: 'other@example.com',
        },
      ])
      .mockResolvedValueOnce([
        { id: 15, engineer_id: 7, recipient_id: null, loai_hoi_thoai: 'admin' },
      ]);

    await expect(
      service.replyToConversation(15, 'engineer8', 'ky-su', 'Nội dung bổ sung'),
    ).rejects.toThrow('Không tìm thấy yêu cầu hỗ trợ.');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('allows either participant to reply in a direct engineer conversation', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 8,
          ten_dang_nhap: 'engineer8',
          ho_ten: 'Kỹ sư khác',
          email: 'other@example.com',
        },
      ])
      .mockResolvedValueOnce([
        { id: 15, engineer_id: 7, recipient_id: 8, loai_hoi_thoai: 'ky-su' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.replyToConversation(15, 'engineer8', 'ky-su', 'Nội dung bổ sung'),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[2][1]).toEqual([
      15,
      8,
      'ky-su',
      'Kỹ sư khác',
      'other@example.com',
      'Nội dung bổ sung',
    ]);
  });

  it('finds only another engineer by exact registered email', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 7,
          ten_dang_nhap: 'engineer7',
          ho_ten: 'Kỹ sư',
          email: 'engineer@example.com',
        },
      ])
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 8,
          ten_dang_nhap: 'engineer8',
          ho_ten: 'Kỹ sư khác',
          email: 'peer@example.com',
        },
      ]);

    await expect(
      service.findEngineerByEmail('engineer7', ' PEER@example.com '),
    ).resolves.toEqual({
      id: 8,
      name: 'Kỹ sư khác',
      email: 'peer@example.com',
    });
    expect(query.mock.calls[1][0]).toContain("'ky-su' = ANY(cong_vai_tro)");
    expect(query.mock.calls[1][0]).toContain('ma_nguoi_dung <> $2');
    expect(query.mock.calls[1][1]).toEqual(['peer@example.com', 7]);
  });

  it('creates and reuses a direct engineer conversation', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 7,
          ten_dang_nhap: 'engineer7',
          ho_ten: 'Kỹ sư',
          email: 'engineer@example.com',
        },
      ])
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 8,
          ten_dang_nhap: 'engineer8',
          email: 'peer@example.com',
          cong_vai_tro: ['ky-su'],
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 24 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.createEngineerDirectConversation('engineer7', 8, 'Xin chào.'),
    ).resolves.toBe(24);
    expect(query.mock.calls[2][0]).toContain('pg_advisory_xact_lock');
    expect(query.mock.calls[3][0]).toContain("loai_hoi_thoai = 'ky-su'");
    expect(query.mock.calls[4][1]).toEqual([
      24,
      7,
      'Kỹ sư',
      'engineer@example.com',
      'Xin chào.',
    ]);
  });

  it('rejects a direct chat with oneself without opening a transaction', async () => {
    query.mockResolvedValueOnce([
      {
        ma_nguoi_dung: 7,
        ten_dang_nhap: 'engineer7',
        ho_ten: 'Kỹ sư',
        email: 'engineer@example.com',
      },
    ]);

    await expect(
      service.createEngineerDirectConversation('engineer7', 7, 'Xin chào.'),
    ).rejects.toThrow('Không thể tự nhắn tin');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('stores area manager replies with the new sender role', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 9,
          ten_dang_nhap: 'manager',
          ho_ten: 'Quản lý vùng',
          email: 'manager@example.com',
        },
      ])
      .mockResolvedValueOnce([
        { id: 15, engineer_id: 7, recipient_id: null, loai_hoi_thoai: 'admin' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.replyToConversation(
      15,
      'manager',
      'quan-ly-khu-vuc',
      'Đã tiếp nhận.',
    );

    expect(query.mock.calls[2][1]).toEqual([
      15,
      9,
      'quan-ly-khu-vuc',
      'Quản lý vùng',
      'manager@example.com',
      'Đã tiếp nhận.',
    ]);
    expect(query.mock.calls[3][1]).toEqual([15, 'da_tra_loi']);
  });

  it('stores admin replies and updates the conversation status', async () => {
    query
      .mockResolvedValueOnce([
        {
          ma_nguoi_dung: 2,
          ten_dang_nhap: 'admin',
          ho_ten: 'Quản trị',
          email: 'admin@example.com',
        },
      ])
      .mockResolvedValueOnce([
        { id: 15, engineer_id: 7, recipient_id: null, loai_hoi_thoai: 'admin' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.replyToConversation(
      15,
      'admin',
      'quan-tri-vien',
      'Tôi đã kiểm tra và xử lý yêu cầu.',
    );

    expect(query.mock.calls[2][1]).toEqual([
      15,
      2,
      'quan-tri-vien',
      'Quản trị',
      'admin@example.com',
      'Tôi đã kiểm tra và xử lý yêu cầu.',
    ]);
    expect(query.mock.calls[3][1]).toEqual([15, 'da_tra_loi']);
  });
});
