import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './ung-dung.controller.js';
import { AuthSessionService } from './xac-thuc/phien-xac-thuc.service.js';
import { NguoiDungService } from './phan-he/nguoi-dung/nguoi-dung.service.js';
import { UyQuyenService } from './phan-he/uy-quyen/uy-quyen.service.js';

describe('AppController', () => {
  let appController: AppController;
  const sessions = { verify: vi.fn() };
  const users = {
    findAccess: vi.fn().mockResolvedValue(null),
    findProfileByUsername: vi.fn(),
    findAvatarPath: vi.fn().mockResolvedValue(null),
  };
  const permissions = {
    getEnabledPermissionIds: vi.fn().mockResolvedValue(['kham-pha-ban-do']),
    getEnabledPermissionIdsForAccount: vi
      .fn()
      .mockResolvedValue(['kham-pha-ban-do']),
    getButtonsForAccountOnPage: vi.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    sessions.verify.mockReturnValue(null);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AuthSessionService,
          useValue: sessions,
        },
        {
          provide: NguoiDungService,
          useValue: users,
        },
        {
          provide: UyQuyenService,
          useValue: permissions,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('home', () => {
    it('renders the public map for signed-out visitors', async () => {
      const result = await appController.home({ headers: {} } as never);

      expect(result.currentUser).toBeNull();
      expect(result.enabledPermissionIds).toEqual(['kham-pha-ban-do']);
    });

    it('renders the assigned engineer area without waiting for geocoding', async () => {
      sessions.verify.mockReturnValue({
        username: 'engineer',
        role: 'ky-su',
        expiresAt: Date.now() + 60_000,
      });
      users.findProfileByUsername.mockResolvedValue({
        ma_nguoi_dung: 1,
        ten_dang_nhap: 'engineer',
        ho_ten: 'Engineer',
        khu_vuc_duoc_xem: 'Nghệ An,TP Vinh,Phường Trường Vinh',
        cong_vai_tro: ['ky-su'],
        duoc_dang_nhap: true,
      });
      const result = await appController.home({
        headers: { cookie: 'hk_session=token' },
      } as never);

      expect(result.currentUser?.assignedArea).toBe(
        'Nghệ An,TP Vinh,Phường Trường Vinh',
      );
    });
  });
});
