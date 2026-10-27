import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { PortalViewContextInterceptor } from './ngu-canh-giao-dien-cong.interceptor.js';

describe('PortalViewContextInterceptor', () => {
  const users = {
    findProfileByUsername: vi.fn(),
    findAvatarPath: vi.fn(),
  };
  const permissions = {
    getPageIdForPath: vi.fn().mockReturnValue('nguoi-dung'),
    getButtonsForAccountOnPage: vi.fn().mockResolvedValue([
      { title: 'Danh sách công trình', path: '/cong-trinh/danh-sach' },
    ]),
  };
  let interceptor: PortalViewContextInterceptor;

  beforeEach(() => {
    vi.clearAllMocks();
    users.findProfileByUsername.mockResolvedValue({
      ma_nguoi_dung: 12,
      ten_dang_nhap: 'kysu01',
      ho_ten: 'Nguyen Van A',
      khu_vuc_duoc_xem: 'Nghe An',
    });
    users.findAvatarPath.mockResolvedValue('uploads/nguoi-dung/12/avatar.jpg');
    interceptor = new PortalViewContextInterceptor(
      users as never,
      {
        get: vi.fn().mockReturnValue('tai_khoan_danh_sach'),
      } as never,
      permissions as never,
    );
  });

  function contextFor(role: string): ExecutionContext {
    const request = {
      authSession: { username: 'kysu01', role },
      path: '/nguoi-dung',
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: vi.fn(),
    } as unknown as ExecutionContext;
  }

  it('adds the account profile to rendered pages for every authenticated role', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        contextFor('quan-tri-vien'),
        { handle: () => of({ currentUser: { username: 'kysu01' } }) } as CallHandler,
      ) as never,
    );

    expect(result).toMatchObject({
      currentUser: {
        username: 'kysu01',
        role: 'quan-tri-vien',
        fullName: 'Nguyen Van A',
        assignedArea: 'Nghe An',
        hasAvatar: true,
        avatarUrl: '/nguoi-dung/ho-so/anh',
      },
      pageButtons: [
        {
          title: 'Danh sách công trình',
          path: '/cong-trinh/danh-sach',
        },
      ],
    });
    expect(permissions.getButtonsForAccountOnPage).toHaveBeenCalledWith(
      12,
      'nguoi-dung',
    );
  });

  it('adds the profile avatar to rendered pages for map viewers', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(
        contextFor('nguoi-xem-ban-do'),
        { handle: () => of({}) } as CallHandler,
      ) as never,
    );

    expect(users.findAvatarPath).toHaveBeenCalledWith(12);
    expect(result).toMatchObject({
      currentUser: {
        role: 'nguoi-xem-ban-do',
        hasAvatar: true,
        avatarUrl: '/nguoi-dung/ho-so/anh',
      },
    });
  });
});
