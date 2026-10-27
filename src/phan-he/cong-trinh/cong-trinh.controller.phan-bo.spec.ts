import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CongTrinhController } from './cong-trinh.controller.js';

describe('CongTrinhController project allocation', () => {
  const projects = [
    {
      id: 21,
      ten_cong_trinh: 'Công trình A',
      dia_diem: 'Phường A, Thành phố B',
    },
    {
      id: 34,
      ten_cong_trinh: 'Công trình B',
      dia_diem: 'Phường C, Thành phố B',
    },
  ];
  const square = (west: number): number[][][] => [
    [
      [west, 10],
      [west + 1, 10],
      [west + 1, 11],
      [west, 11],
      [west, 10],
    ],
  ];
  const service = {
    findAll: vi.fn(),
    findProjectsWithLevelOneSurveyAreas: vi.fn(),
  };
  const holes = {};
  const users = {
    findAccount: vi.fn(),
    findAccountByUsername: vi.fn(),
    findAll: vi.fn(),
    findEngineerAllocationSummaries: vi.fn(),
    findProjectAllocationStatuses: vi.fn(),
    assignEngineerAreaFromProjects: vi.fn(),
    findProjectAssignmentAccess: vi.fn(),
    findEngineerProjectAssignments: vi.fn(),
    findMyPendingEngineerCancellationRequests: vi.fn(),
    findPendingEngineerAssignmentRenewalRequests: vi.fn(),
    approveEngineerAssignmentRenewalRequest: vi.fn(),
    submitEngineerAssignmentRenewalRequest: vi.fn(),
  };
  const areas = {
    resolveAreaAtPoint: vi.fn(),
    resolveBounds: vi.fn(),
  };
  const maps = {
    findProjectAnchorPoints: vi.fn(),
    findProjectIdsInBounds: vi.fn(),
  };
  let controller: CongTrinhController;

  beforeEach(() => {
    vi.clearAllMocks();
    areas.resolveAreaAtPoint
      .mockReset()
      .mockResolvedValueOnce({
        name: 'Phường A, Thành phố B',
        bounds: {
          south: 10,
          north: 11,
          west: 101,
          east: 102,
          geometry: { type: 'Polygon', coordinates: square(101) },
        },
      })
      .mockResolvedValueOnce({
        name: 'Phường C, Thành phố B',
        bounds: {
          south: 10,
          north: 11,
          west: 102,
          east: 103,
          geometry: { type: 'Polygon', coordinates: square(102) },
        },
      });
    service.findAll.mockResolvedValue(projects);
    maps.findProjectAnchorPoints.mockResolvedValue([
      {
        cong_trinh_id: 21,
        latitude: 10.5,
        longitude: 101.5,
        first_latitude: 10.4,
        first_longitude: 101.4,
      },
      { cong_trinh_id: 34, latitude: 10.5, longitude: 102.5 },
    ]);
    users.findAccount.mockResolvedValue({
      ma_nguoi_dung: 8,
      duoc_dang_nhap: true,
      cong_vai_tro: ['ky-su'],
    });
    users.findEngineerAllocationSummaries.mockResolvedValue([
      { ma_nguoi_dung: 8, ho_ten: 'Kỹ sư', assigned_count: 0 },
    ]);
    users.findProjectAllocationStatuses.mockResolvedValue([]);
    controller = new CongTrinhController(
      service as never,
      holes as never,
      users as never,
      areas as never,
      maps as never,
    );
  });

  function request(role = 'quan-tri-vien'): Request {
    return {
      authSession: { username: 'admin01', role },
    } as Request;
  }

  function response(): Response {
    return { json: vi.fn() } as unknown as Response;
  }

  it('renders pending renewal requests for administrators', async () => {
    const pendingRequests = [{ id: 91, den_ngay_moi: '2026-12-31' }];
    users.findPendingEngineerAssignmentRenewalRequests.mockResolvedValue(
      pendingRequests,
    );

    await expect(
      controller.pendingEngineerAssignmentRenewals(
        request(),
        undefined,
      ),
    ).resolves.toMatchObject({
      title: 'Yêu cầu gia hạn phân công chờ duyệt',
      requests: pendingRequests,
      renewalApproved: false,
    });
    expect(users.findPendingEngineerAssignmentRenewalRequests).toHaveBeenCalledOnce();
  });

  it('approves a renewal for administrators and redirects with confirmation', async () => {
    const redirect = vi.fn();
    const res = { redirect } as unknown as Response;

    await controller.approveEngineerAssignmentRenewal(91, request(), res);

    expect(users.approveEngineerAssignmentRenewalRequest).toHaveBeenCalledWith(
      91,
    );
    expect(redirect).toHaveBeenCalledWith(
      '/cong-trinh/gia-han-cho-duyet?approved=1',
    );
  });

  it('rejects renewal administration pages for non-administrators', async () => {
    await expect(
      controller.pendingEngineerAssignmentRenewals(request('ky-su'), undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.approveEngineerAssignmentRenewal(
        91,
        request('ky-su'),
        response(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(users.approveEngineerAssignmentRenewalRequest).not.toHaveBeenCalled();
  });

  it('uses project surface anchors to resolve wards and pin the first selected project', async () => {
    service.findAll.mockResolvedValue([...projects].reverse());
    const res = response();

    await controller.allocateProjects(
      {
        assignments: [
          { projectId: 21, startDate: '2026-10-23', endDate: '2026-12-31' },
          { projectId: 34, startDate: '2026-10-25', endDate: '2027-01-31' },
        ],
        engineerId: 8,
      },
      request(),
      res,
    );

    expect(areas.resolveAreaAtPoint).toHaveBeenNthCalledWith(
      1,
      10.5,
      101.5,
      'Phường A, Thành phố B',
    );
    expect(areas.resolveAreaAtPoint).toHaveBeenNthCalledWith(
      2,
      10.5,
      102.5,
      'Phường C, Thành phố B',
    );
    expect(users.assignEngineerAreaFromProjects).toHaveBeenCalledWith(
      8,
      'Phường A, Thành phố B; Phường C, Thành phố B',
      { type: 'MultiPolygon', coordinates: [square(101), square(102)] },
      10.5,
      101.5,
      [
        {
          projectId: 21,
          startDate: '2026-10-23',
          endDate: '2026-12-31',
          areaName: 'Phường A, Thành phố B',
          geometry: { type: 'Polygon', coordinates: square(101) },
          latitude: 10.5,
          longitude: 101.5,
        },
        {
          projectId: 34,
          startDate: '2026-10-25',
          endDate: '2027-01-31',
          areaName: 'Phường C, Thành phố B',
          geometry: { type: 'Polygon', coordinates: square(102) },
          latitude: 10.5,
          longitude: 102.5,
        },
      ],
    );
    expect(res.json).toHaveBeenCalledWith({
      message: 'Đã bổ nhiệm 2 công trình cho kỹ sư trong 2 khu vực.',
      areaNames: ['Phường A, Thành phố B', 'Phường C, Thành phố B'],
    });

  });

  it('shows assignment status in the engineer project list only', async () => {
    const engineerProjects = [{ ...projects[0] }];
    service.findProjectsWithLevelOneSurveyAreas.mockResolvedValue(
      engineerProjects,
    );
    users.findAccountByUsername.mockResolvedValue({
      ma_nguoi_dung: 8,
      khu_vuc_duoc_xem: 'Phường A',
      khu_vuc_phan_cong_ranh_gioi: { type: 'Polygon', coordinates: [] },
    });
    users.findProjectAssignmentAccess.mockResolvedValue({
      hasAssignments: true,
      activeProjectIds: [21],
    });
    users.findMyPendingEngineerCancellationRequests.mockResolvedValue([
      {
        cong_trinh_id: 21,
        ten_cong_trinh: 'Công trình A',
        ly_do: 'Không tiếp tục thực hiện',
      },
    ]);
    users.findEngineerProjectAssignments.mockResolvedValue([
      {
        cong_trinh_id: 21,
        da_hoan_thanh: false,
        dang_hieu_luc: true,
      },
    ]);

    const result = await controller.danhSach({
      authSession: { username: 'engineer01', role: 'ky-su' },
      query: {},
    } as unknown as Request);

    expect(result.columns).toContain('trang_thai_phan_cong');
    expect(result.data[0].trang_thai_phan_cong).toBe('Đang thực hiện');
    expect(users.findEngineerProjectAssignments).toHaveBeenCalledWith(8);
    expect(result.pendingCancellationRequests).toHaveLength(1);
    expect(users.findMyPendingEngineerCancellationRequests).toHaveBeenCalledWith(
      8,
    );
  });

  it('does not show projects after their assignment cancellation is approved', async () => {
    service.findProjectsWithLevelOneSurveyAreas.mockResolvedValue([]);
    users.findAccountByUsername.mockResolvedValue({
      ma_nguoi_dung: 8,
      khu_vuc_duoc_xem: 'Phường A',
      khu_vuc_phan_cong_ranh_gioi: { type: 'Polygon', coordinates: [] },
    });
    users.findProjectAssignmentAccess.mockResolvedValue({
      hasAssignments: true,
      activeProjectIds: [],
    });
    users.findEngineerProjectAssignments.mockResolvedValue([
      {
        cong_trinh_id: 21,
        da_hoan_thanh: false,
        dang_hieu_luc: false,
        cancellation_status: 'da_duyet',
      },
    ]);

    const result = await controller.danhSach({
      authSession: { username: 'engineer01', role: 'ky-su' },
      query: {},
    } as unknown as Request);

    expect(result.data).toEqual([]);
    expect(service.findProjectsWithLevelOneSurveyAreas).toHaveBeenCalledOnce();
    expect(service.findProjectsWithLevelOneSurveyAreas).toHaveBeenCalledWith(
      [],
    );
  });

  it('shows assigned projects even when the engineer has no area boundary', async () => {
    const engineerProjects = [{ ...projects[0] }];
    service.findProjectsWithLevelOneSurveyAreas.mockResolvedValue(
      engineerProjects,
    );
    users.findAccountByUsername.mockResolvedValue({ ma_nguoi_dung: 8 });
    users.findProjectAssignmentAccess.mockResolvedValue({
      hasAssignments: true,
      activeProjectIds: [21],
    });
    users.findEngineerProjectAssignments.mockResolvedValue([
      {
        cong_trinh_id: 21,
        da_hoan_thanh: false,
        dang_hieu_luc: true,
      },
    ]);

    const result = await controller.danhSach({
      authSession: { username: 'engineer01', role: 'ky-su' },
      query: {},
    } as unknown as Request);

    expect(service.findProjectsWithLevelOneSurveyAreas).toHaveBeenCalledWith([
      21,
    ]);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(21);
  });

  it('saves the boundary resolved by the allocation page without repeating external geocoding', async () => {
    const res = response();
    const assignments = [
      { projectId: 21, startDate: '2026-10-23', endDate: '2026-12-31' },
    ];
    const geometry = { type: 'Polygon' as const, coordinates: square(101) };

    await controller.allocateProjects(
      {
        assignments,
        engineerId: 8,
        resolvedAreas: [{ projectId: 21, name: 'Phường A', geometry }],
      },
      request(),
      res,
    );

    expect(areas.resolveAreaAtPoint).not.toHaveBeenCalled();
    expect(users.assignEngineerAreaFromProjects).toHaveBeenCalledWith(
      8,
      'Phường A',
      geometry,
      10.5,
      101.5,
      [
        {
          projectId: 21,
          startDate: '2026-10-23',
          endDate: '2026-12-31',
          areaName: 'Phường A',
          geometry,
          latitude: 10.5,
          longitude: 101.5,
        },
      ],
    );
  });

  it('renders a separate allocation page for administrators', async () => {
    service.findAll.mockResolvedValue(projects);

    const result = await controller.allocationPage(request());

    expect(result).toMatchObject({
      title: 'Phân bổ công trình',
      projects,
      projectTabs: [
        { id: 'unassigned', projects: [{ project: projects[0], allocation: null }, { project: projects[1], allocation: null }] },
        { id: 'assigned', projects: [] },
        { id: 'overdue', projects: [] },
        { id: 'pending-cancellation', projects: [] },
      ],
      engineers: [{ ma_nguoi_dung: 8, ho_ten: 'Kỹ sư', assigned_count: 0 }],
    });
  });

  it('separates available projects from assigned, overdue, and pending cancellation projects', async () => {
    service.findAll.mockResolvedValue(projects);
    users.findProjectAllocationStatuses.mockResolvedValue([
      {
        cong_trinh_id: 21,
        allocation_status: 'overdue',
        engineer_name: 'Kỹ sư A',
      },
      {
        cong_trinh_id: 34,
        allocation_status: 'pending_cancellation',
        engineer_name: 'Kỹ sư B',
      },
    ]);

    const result = await controller.allocationPage(request());

    expect(result.projectTabs).toEqual([
      { id: 'unassigned', label: 'Chưa phân công', projects: [] },
      { id: 'assigned', label: 'Đã có người đảm nhiệm', projects: [] },
      {
        id: 'overdue',
        label: 'Đã quá hạn',
        projects: [
          expect.objectContaining({
            project: expect.objectContaining({ id: 21 }),
            allocation: expect.objectContaining({
              engineer_name: 'Kỹ sư A',
            }),
          }),
        ],
      },
      {
        id: 'pending-cancellation',
        label: 'Đang treo đơn hủy',
        projects: [
          expect.objectContaining({
            project: expect.objectContaining({ id: 34 }),
            allocation: expect.objectContaining({
              engineer_name: 'Kỹ sư B',
            }),
          }),
        ],
      },
    ]);
  });

  it('returns selected floor-plan points and their area boundaries for the map preview', async () => {
    const result = await controller.previewProjectAllocation(
      { projectIds: [21, 34] },
      request(),
    );

    expect(maps.findProjectAnchorPoints).toHaveBeenCalledWith([21, 34]);
    expect(result.projects).toEqual([
      {
        id: 21,
        ten_cong_trinh: 'Công trình A',
        dia_diem: 'Phường A, Thành phố B',
        latitude: 10.4,
        longitude: 101.4,
        lookupLatitude: 10.5,
        lookupLongitude: 101.5,
      },
      {
        id: 34,
        ten_cong_trinh: 'Công trình B',
        dia_diem: 'Phường C, Thành phố B',
        latitude: 10.5,
        longitude: 102.5,
        lookupLatitude: 10.5,
        lookupLongitude: 102.5,
      },
    ]);
    expect(areas.resolveAreaAtPoint).not.toHaveBeenCalled();
  });

  it('rejects the separate allocation page for non-admin users', async () => {
    await expect(
      controller.allocationPage(request('ky-su')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects area allocation when the caller is not an administrator', async () => {
    await expect(
      controller.allocateProjects(
        {
          assignments: [
            {
              projectId: 21,
              startDate: '2026-10-23',
              endDate: '2026-12-31',
            },
          ],
          engineerId: 8,
        },
        request('ky-su'),
        response(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not update the engineer area if any project has no coordinate', async () => {
    maps.findProjectAnchorPoints.mockResolvedValue([
      { cong_trinh_id: 21, latitude: 10.5, longitude: 101.5 },
    ]);

    await expect(
      controller.allocateProjects(
        {
          assignments: [
            {
              projectId: 21,
              startDate: '2026-10-23',
              endDate: '2026-12-31',
            },
            {
              projectId: 34,
              startDate: '2026-10-23',
              endDate: '2026-12-31',
            },
          ],
          engineerId: 8,
        },
        request(),
        response(),
      ),
    ).rejects.toThrow('tọa độ mặt bằng hợp lệ cho công trình: Công trình B');
    expect(users.assignEngineerAreaFromProjects).not.toHaveBeenCalled();
  });
});
