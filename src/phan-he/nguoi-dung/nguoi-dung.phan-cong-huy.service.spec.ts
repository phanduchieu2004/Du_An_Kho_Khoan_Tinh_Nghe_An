import type { Repository } from 'typeorm';
import { NguoiDung } from './thuc-the/nguoi-dung.entity.js';
import { NguoiDungService } from './nguoi-dung.service.js';

describe('NguoiDungService assignment cancellation requests', () => {
  const query = vi.fn();
  const transaction = vi.fn();
  let service: NguoiDungService;

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue([]);
    transaction.mockImplementation(
      (callback: (manager: { query: typeof query }) => Promise<void>) =>
        callback({ query }),
    );
    service = new NguoiDungService({
      manager: { query, transaction },
    } as unknown as Repository<NguoiDung>);
  });

  it('classifies historical assignments into the three requested tabs', async () => {
    await service.findEngineerAssignmentHistory(12);

    expect(query.mock.calls[0][0]).toContain("THEN 'completed'");
    expect(query.mock.calls[0][0]).toContain("THEN 'in_progress'");
    expect(query.mock.calls[0][0]).toContain("ELSE 'unfinished'");
    expect(query.mock.calls[0][0]).toContain('cong_trinh_phan_cong_huy');
    expect(query.mock.calls[0][1]).toEqual([12]);
  });

  it('creates a cancellation request tied to its assigned engineer and assignment', async () => {
    query.mockResolvedValueOnce([{ id: 34 }]);

    await service.submitEngineerCancellationRequest(
      12,
      56,
      'Không thể tiếp tục thực hiện nhiệm vụ.',
    );

    expect(query.mock.calls[0][0]).toContain("r.trang_thai = 'cho_duyet'");
    expect(query.mock.calls[0][0]).toContain('a.ma_nguoi_dung = $2');
    expect(query.mock.calls[0][1]).toEqual([
      56,
      12,
      'Không thể tiếp tục thực hiện nhiệm vụ.',
    ]);
  });

  it('does not create requests for inactive, completed, or already-requested assignments', async () => {
    await expect(
      service.submitEngineerCancellationRequest(12, 56, 'Lý do hủy công trình'),
    ).rejects.toThrow('Không tìm thấy phân công đang thực hiện');
  });

  it('allows cancellation requests regardless of the assignment date range', async () => {
    await service.findCancelableEngineerAssignments(12);

    const cancellationQuery = String(query.mock.calls[0][0]);
    expect(cancellationQuery).toContain('a.dang_hieu_luc');
    expect(cancellationQuery).toContain('NOT a.da_hoan_thanh');
    expect(cancellationQuery).not.toContain('CURRENT_TIMESTAMP');
    expect(cancellationQuery).not.toContain('a.tu_ngay <=');
    expect(cancellationQuery).not.toContain('a.den_ngay >=');
    expect(query.mock.calls[0][1]).toEqual([12]);
  });

  it('ends the assignment only after the administrator approves the request', async () => {
    query
      .mockResolvedValueOnce([
        { id: 34, assignment_id: 56, ma_nguoi_dung: 12 },
      ])
      .mockResolvedValueOnce([{ id: 56 }])
      .mockResolvedValueOnce([]);

    await service.approveEngineerCancellationRequest(34);

    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('SET dang_hieu_luc = FALSE');
    expect(query.mock.calls[1][0]).toContain(
      "trang_thai_phan_bo = 'chua_phan_bo'",
    );
    expect(query.mock.calls[1][0]).toContain('WHERE id = $1');
    expect(query.mock.calls[1][0]).not.toContain(
      'WHERE id = $1 AND dang_hieu_luc',
    );
    expect(query.mock.calls[1][1]).toEqual([56, 12]);
    expect(query.mock.calls[2][1]).toEqual([34]);
  });

  it('approves a pending cancellation even if its assignment is already missing', async () => {
    query
      .mockResolvedValueOnce([
        { id: 34, assignment_id: 56, ma_nguoi_dung: 12 },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.approveEngineerCancellationRequest(34)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][1]).toEqual([56, 12]);
    expect(query.mock.calls[2][0]).toContain("SET trang_thai = 'da_duyet'");
    expect(query.mock.calls[2][1]).toEqual([34]);
  });

  it('loads the latest cancellation decision alongside assignment history', async () => {
    await service.findEngineerProjectAssignments(12);

    expect(query.mock.calls[0][0]).toContain(
      'cancellation.trang_thai AS cancellation_status',
    );
    expect(query.mock.calls[0][0]).toContain(
      'WHERE r.assignment_id = a.id',
    );
    expect(query.mock.calls[0][0]).toContain(
      'cancellation.trang_thai AS cancellation_status',
    );
    expect(query.mock.calls[0][0]).not.toContain(
      "cancellation.trang_thai IS DISTINCT FROM 'da_duyet'",
    );
    expect(query.mock.calls[0][1]).toEqual([12]);
  });

  it('submits an assignment renewal request without changing its current end date', async () => {
    query.mockResolvedValueOnce([{ id: 91 }]);

    await service.submitEngineerAssignmentRenewalRequest(
      12,
      56,
      '2026-12-31',
      'Cần thêm thời gian hoàn tất khảo sát.',
    );

    expect(query.mock.calls[0][0]).toContain(
      'INSERT INTO cong_trinh_phan_cong_gia_han',
    );
    expect(query.mock.calls[0][0]).toContain('$3::date > a.den_ngay');
    expect(query.mock.calls[0][0]).toContain(
      "cancellation.trang_thai = 'cho_duyet'",
    );
    expect(query.mock.calls[0][1]).toEqual([
      56,
      12,
      '2026-12-31',
      'Cần thêm thời gian hoàn tất khảo sát.',
    ]);
  });

  it('updates the assignment end date only after admin approval', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 91,
          assignment_id: 56,
          ma_nguoi_dung: 12,
          den_ngay_moi: '2026-12-31',
        },
      ])
      .mockResolvedValueOnce([{ id: 56 }])
      .mockResolvedValueOnce([]);

    await service.approveEngineerAssignmentRenewalRequest(91);

    expect(transaction).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[1][0]).toContain('SET den_ngay = $2::date');
    expect(query.mock.calls[1][0]).toContain('WHERE id = $1');
    expect(query.mock.calls[1][0]).not.toContain('AND dang_hieu_luc');
    expect(query.mock.calls[1][0]).not.toContain('AND NOT da_hoan_thanh');
    expect(query.mock.calls[1][0]).not.toContain('RETURNING');
    expect(query.mock.calls[1][1]).toEqual([56, '2026-12-31']);
    expect(query.mock.calls[2][0]).toContain("SET trang_thai = 'da_duyet'");
    expect(query.mock.calls[2][1]).toEqual([91]);
  });

  it('lists pending renewal requests with current and proposed end dates', async () => {
    await service.findPendingEngineerAssignmentRenewalRequests();

    const pendingQuery = String(query.mock.calls[0][0]);
    expect(pendingQuery).toContain('r.trang_thai = \'cho_duyet\'');
    expect(pendingQuery).toContain('a.den_ngay AS den_ngay_hien_tai');
    expect(pendingQuery).toContain('r.den_ngay_moi');
    expect(pendingQuery).toContain('u.ho_ten');
    expect(query.mock.calls[0][1]).toBeUndefined();
  });

  it('includes the latest renewal request status in engineer assignment history', async () => {
    await service.findEngineerAssignmentHistory(12);

    const historyQuery = String(query.mock.calls[0][0]);
    expect(historyQuery).toContain(
      'renewal.trang_thai AS renewal_status',
    );
    expect(historyQuery).toContain(
      'FROM cong_trinh_phan_cong_gia_han r',
    );
    expect(query.mock.calls[0][1]).toEqual([12]);
  });
});
