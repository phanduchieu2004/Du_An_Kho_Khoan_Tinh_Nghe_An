import type { Request, Response } from 'express';
import { HoTroController } from './ho-tro.controller.js';

describe('HoTroController', () => {
  const support = {
    listAdminConversations: vi.fn(),
    listEngineerConversations: vi.fn(),
    createEngineerConversation: vi.fn(),
    findEngineerByEmail: vi.fn(),
    createEngineerDirectConversation: vi.fn(),
    replyToConversation: vi.fn(),
  };
  let controller: HoTroController;

  beforeEach(() => {
    vi.clearAllMocks();
    support.listAdminConversations.mockResolvedValue({
      conversations: [],
      selectedConversation: null,
      viewerId: 7,
    });
    support.listEngineerConversations.mockResolvedValue({
      account: { ten_dang_nhap: 'engineer', email: 'engineer@example.com' },
      conversations: [],
    });
    support.createEngineerConversation.mockResolvedValue(17);
    controller = new HoTroController(support as never);
  });

  it('renders the engineer inbox with only their conversations', async () => {
    support.listEngineerConversations.mockResolvedValue({
      conversations: [{ id: 21 }],
      selectedConversation: null,
      viewerId: 7,
      account: { ten_dang_nhap: 'engineer', email: 'engineer@example.com' },
    });
    const result = await controller.index({
      authSession: { username: 'engineer', role: 'ky-su' },
    } as Request);

    expect(result).toMatchObject({
      role: 'ky-su',
      account: { email: 'engineer@example.com' },
      conversations: [{ id: 21 }],
      viewerId: 7,
    });
    expect(support.listEngineerConversations).toHaveBeenCalledWith(
      'engineer',
      undefined,
    );
    expect(support.listAdminConversations).not.toHaveBeenCalled();
  });

  it('looks up another engineer by registered email', async () => {
    support.findEngineerByEmail.mockResolvedValue({
      id: 8,
      name: 'Kỹ sư khác',
      email: 'peer@example.com',
    });

    await expect(
      controller.findEngineer('peer@example.com', {
        authSession: { username: 'engineer', role: 'ky-su' },
      } as Request),
    ).resolves.toEqual({
      id: 8,
      name: 'Kỹ sư khác',
      email: 'peer@example.com',
    });
    expect(support.findEngineerByEmail).toHaveBeenCalledWith(
      'engineer',
      'peer@example.com',
    );
  });

  it('starts a direct engineer conversation and redirects to it', async () => {
    support.createEngineerDirectConversation.mockResolvedValue(24);
    const redirect = vi.fn();

    await controller.startEngineerChat(
      { recipient_id: '8', noi_dung: 'Xin chào.' },
      { authSession: { username: 'engineer', role: 'ky-su' } } as Request,
      { redirect } as unknown as Response,
    );

    expect(support.createEngineerDirectConversation).toHaveBeenCalledWith(
      'engineer',
      8,
      'Xin chào.',
    );
    expect(redirect).toHaveBeenCalledWith('/ho-tro?conversation=24#yeu-cau-24');
  });

  it('renders the administrator inbox', async () => {
    const result = await controller.index({
      authSession: { username: 'admin', role: 'quan-tri-vien' },
    } as Request);

    expect(result).toMatchObject({ role: 'quan-tri-vien', conversations: [] });
    expect(result).toMatchObject({
      portalOptions: expect.arrayContaining([
        expect.objectContaining({ slug: 'ky-su', title: 'Kỹ sư' }),
        expect.objectContaining({
          slug: 'quan-tri-vien',
          title: 'Quản trị viên',
        }),
        expect.objectContaining({
          slug: 'quan-ly-khu-vuc',
          title: 'Quản lý khu vực',
        }),
        expect.objectContaining({
          slug: 'nguoi-xem-ban-do',
          title: 'Người xem bản đồ',
        }),
      ]),
    });
    expect(support.listAdminConversations).toHaveBeenCalledWith('admin', undefined);
  });

  it('renders the shared inbox in the area manager portal', async () => {
    const result = await controller.index({
      authSession: { username: 'manager', role: 'quan-ly-khu-vuc' },
    } as Request);

    expect(result).toMatchObject({
      role: 'quan-ly-khu-vuc',
      conversations: [],
      portalOptions: expect.any(Array),
    });
    expect(support.listAdminConversations).toHaveBeenCalledWith(
      'manager',
      undefined,
    );
  });

  it('marks the selected admin conversation read while rendering the thread', async () => {
    support.listAdminConversations.mockResolvedValue({
      conversations: [{ id: 17, unread: false }],
      selectedConversation: { id: 17, messages: [] },
    });

    const result = await controller.index(
      { authSession: { username: 'admin', role: 'quan-tri-vien' } } as Request,
      '17',
    );

    expect(support.listAdminConversations).toHaveBeenCalledWith('admin', 17);
    expect(result).toMatchObject({
      selectedConversation: { id: 17 },
      conversations: [{ unread: false }],
    });
  });

  it('rejects invalid selected conversation identifiers', async () => {
    await expect(
      controller.index(
        { authSession: { username: 'admin', role: 'quan-tri-vien' } } as Request,
        'not-an-id',
      ),
    ).rejects.toThrow('Mã hội thoại không hợp lệ.');
    expect(support.listAdminConversations).not.toHaveBeenCalled();
  });

  it('creates engineer support requests and redirects to the conversation', async () => {
    const redirect = vi.fn();
    const response = { redirect } as unknown as Response;

    await controller.create(
      { tieu_de: 'Yêu cầu hỗ trợ', noi_dung: 'Xin kiểm tra giúp.' },
      { authSession: { username: 'engineer', role: 'ky-su' } } as Request,
      response,
    );

    expect(support.createEngineerConversation).toHaveBeenCalledWith(
      'engineer',
      'Yêu cầu hỗ trợ',
      'Xin kiểm tra giúp.',
    );
    expect(redirect).toHaveBeenCalledWith(
      '/ho-tro?conversation=17#yeu-cau-17',
    );
  });

  it('saves admin replies in the same support conversation', async () => {
    const redirect = vi.fn();

    await controller.reply(
      17,
      { noi_dung: 'Đã xử lý.' },
      { authSession: { username: 'admin', role: 'quan-tri-vien' } } as Request,
      { redirect } as unknown as Response,
    );

    expect(support.replyToConversation).toHaveBeenCalledWith(
      17,
      'admin',
      'quan-tri-vien',
      'Đã xử lý.',
    );
    expect(redirect).toHaveBeenCalledWith('/ho-tro?conversation=17#yeu-cau-17');
  });

  it('allows area managers to reply in the shared inbox', async () => {
    const redirect = vi.fn();

    await controller.reply(
      21,
      { noi_dung: 'Đã tiếp nhận.' },
      { authSession: { username: 'manager', role: 'quan-ly-khu-vuc' } } as Request,
      { redirect } as unknown as Response,
    );

    expect(support.replyToConversation).toHaveBeenCalledWith(
      21,
      'manager',
      'quan-ly-khu-vuc',
      'Đã tiếp nhận.',
    );
    expect(redirect).toHaveBeenCalledWith(
      '/ho-tro?conversation=21#yeu-cau-21',
    );
  });
});
