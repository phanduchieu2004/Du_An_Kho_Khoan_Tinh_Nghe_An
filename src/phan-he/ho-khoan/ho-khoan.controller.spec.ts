import { HoKhoanController } from './ho-khoan.controller.js';

describe('HoKhoanController engineer imports', () => {
  const projects = [
    { id: 7, ten_cong_trinh: 'Công trình trong khu vực' },
    { id: 8, ten_cong_trinh: 'Công trình ngoài khu vực' },
  ];
  const findProjects = vi.fn();
  const importFromExcel = vi.fn();
  const findAccountByUsername = vi.fn();
  const service = { findProjects, importFromExcel };
  const users = { findAccountByUsername };
  let controller: HoKhoanController;

  beforeEach(() => {
    vi.clearAllMocks();
    findProjects.mockResolvedValue(projects);
    importFromExcel.mockResolvedValue({ created: 1 });
    controller = new HoKhoanController(
      service as never,
      users as never,
      {} as never,
    );
  });

  it('lists all projects for Excel borehole import', async () => {
    await expect(controller.createPage()).resolves.toEqual({
      title: 'Nhập hố khoan từ Excel',
      projects,
    });
    expect(findAccountByUsername).not.toHaveBeenCalled();
  });

  it('imports boreholes to a project outside the engineer assigned area', async () => {
    const file = {
      originalname: 'ho-khoan.xlsx',
      buffer: Buffer.from('excel'),
    };

    await expect(
      controller.importFromExcel({ cong_trinh_id: '8' }, file),
    ).resolves.toEqual({
      title: 'Nhập hố khoan từ Excel',
      projects,
      result: { created: 1 },
      fileName: 'ho-khoan.xlsx',
    });
    expect(importFromExcel).toHaveBeenCalledWith(file.buffer, 8);
    expect(findAccountByUsername).not.toHaveBeenCalled();
  });
});
