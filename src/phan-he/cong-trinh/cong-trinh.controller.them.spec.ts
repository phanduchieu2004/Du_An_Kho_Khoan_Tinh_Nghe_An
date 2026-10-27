import type { Request, Response } from 'express';
import { CongTrinhController } from './cong-trinh.controller.js';

describe('CongTrinhController engineer project creation', () => {
  const service = {
    create: vi.fn(),
    findCreatedBy: vi.fn(),
    submitProjectEdit: vi.fn(),
    submitLevelTwoSurveyRequest: vi.fn(),
    submitLevelSurveyRequest: vi.fn(),
    findPendingApproval: vi.fn(),
    findPendingSurveyRequests: vi.fn(),
  };
  const holes = { importFromExcel: vi.fn() };
  const users = { findAccountByUsername: vi.fn() };
  const areas = {};
  const maps = {};
  let controller: CongTrinhController;

  beforeEach(() => {
    vi.clearAllMocks();
    users.findAccountByUsername.mockResolvedValue({ ma_nguoi_dung: 17 });
    service.create.mockResolvedValue({ id: 42 });
    controller = new CongTrinhController(
      service as never,
      holes as never,
      users as never,
      areas as never,
      maps as never,
    );
  });

  const body = {
    ten_cong_trinh: 'Công trình kỹ sư',
    ten_mat_bang: 'Mặt bằng A',
    loai_mat_bang: 'Polygon',
    ranh_gioi: '105 18, 105.1 18, 105.1 18.1',
    ma_he_toa_do_nguon: 'WGS84',
  };
  const request = {
    authSession: { username: 'engineer01', role: 'ky-su' },
    query: {},
  } as Request;
  const redirect = vi.fn();
  const response = { redirect } as unknown as Response;

  it('allows an engineer to create a project without an assigned area', async () => {
    await controller.store(body, request, response);

    expect(users.findAccountByUsername).toHaveBeenCalledWith('engineer01');
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ten_cong_trinh: 'Công trình kỹ sư',
        nguoi_tao: 17,
      }),
      'Tài liệu khác',
      [],
      expect.objectContaining({ trang_thai: 'cho_xac_minh' }),
    );
    expect(redirect).toHaveBeenCalledWith(
      '/cong-trinh/da-tao?created=pending',
    );
  });

  it('lists only projects created by the signed-in engineer', async () => {
    const createdProjects = [{ id: 42, da_duyet: false }];
    service.findCreatedBy.mockResolvedValue(createdProjects);

    await expect(controller.createdProjects(request)).resolves.toMatchObject({
      title: 'Công trình đã tạo',
      projects: createdProjects,
      createdPendingApproval: false,
      currentUser: request.authSession,
    });
    expect(service.findCreatedBy).toHaveBeenCalledWith(17);
  });

  it('opens the create page without checking the engineer assigned area', () => {
    expect(controller.createPage(request)).toEqual({
      title: 'Tạo dự án mới',
      currentUser: request.authSession,
    });
    expect(users.findAccountByUsername).not.toHaveBeenCalled();
  });

  it('imports an Excel workbook into the selected existing project', async () => {
    holes.importFromExcel.mockResolvedValue({
      created: 2,
      importedSamples: 5,
      updatedSamples: 1,
    });
    const adminRequest = {
      authSession: { username: 'admin', role: 'quan-tri-vien' },
    } as Request;
    const file = {
      originalname: 'du-lieu.xlsx',
      buffer: Buffer.from('workbook'),
    };

    await controller.importProjectBoreholes(
      42,
      adminRequest,
      response,
      file,
    );

    expect(holes.importFromExcel).toHaveBeenCalledWith(file.buffer, 42);
    expect(redirect).toHaveBeenCalledWith(
      '/cong-trinh/42/sua?importedHoles=2&importedSamples=5&updatedSamples=1',
    );
  });

  it('submits project changes for approval instead of applying them directly', async () => {
    const adminRequest = {
      authSession: { username: 'admin', role: 'quan-tri-vien' },
    } as Request;

    await controller.updateProject(
      42,
      {
        ten_cong_trinh: 'Tên mới',
        dia_diem: 'Địa điểm mới',
        hang_muc: 'Khảo sát',
        ghi_chu: '',
        mat_bang_ids: '',
      },
      adminRequest,
      response,
    );

    expect(service.submitProjectEdit).toHaveBeenCalledWith(
      42,
      {
        ten_cong_trinh: 'Tên mới',
        dia_diem: 'Địa điểm mới',
        hang_muc: 'Khảo sát',
        ghi_chu: '',
      },
      [],
      'admin',
    );
    expect(redirect).toHaveBeenCalledWith('/cong-trinh/42/sua?pending=1');
  });

  it.each([2, 3, 4])(
    'submits a level-%s area linked to its parent for approval',
    async (level) => {
    const adminRequest = {
      authSession: { username: 'admin', role: 'quan-tri-vien' },
    } as Request;

    await controller.submitLevelSurvey(
      42,
      String(level),
      {
        mat_bang_cha_id: '5',
        ten_mat_bang: `Mặt bằng cấp ${level}`,
        loai_mat_bang: 'Polygon',
        ranh_gioi: '{"type":"Polygon","coordinates":[]}',
        ma_he_toa_do_nguon: 'WGS84',
      },
      adminRequest,
      response,
    );

    expect(service.submitLevelSurveyRequest).toHaveBeenCalledWith(
      42,
      5,
      level,
      {
        ten_mat_bang: `Mặt bằng cấp ${level}`,
        loai_mat_bang: 'Polygon',
        ranh_gioi: '{"type":"Polygon","coordinates":[]}',
        ma_he_toa_do_nguon: 'WGS84',
      },
      'admin',
    );
    expect(redirect).toHaveBeenCalledWith(
      '/cong-trinh/42/chi-tiet?levelAreaPending=1',
    );
  });

  it('loads the selected approval tab with pending counts for all levels', async () => {
    const pendingProjects = [{ id: 7 }];
    const pendingSurveys = [
      { cap_mat_bang: 2, id: 11 },
      { cap_mat_bang: 3, id: 12 },
      { cap_mat_bang: 4, id: 13 },
    ];
    service.findPendingApproval.mockResolvedValue(pendingProjects);
    service.findPendingSurveyRequests.mockResolvedValue(pendingSurveys);

    const result = await controller.pendingProjectApprovals(
      {
        authSession: { username: 'admin', role: 'quan-tri-vien' },
      } as Request,
      'cap-4',
    );

    expect(result).toMatchObject({
      activeTab: 'cap-4',
      projects: pendingProjects,
      surveyRequests: [pendingSurveys[2]],
      tabCounts: { projects: 1, levelTwo: 1, levelThree: 1, levelFour: 1 },
    });
  });
});
