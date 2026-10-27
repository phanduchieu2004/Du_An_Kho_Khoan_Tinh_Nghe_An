export const LOGIN_ROLES = [
  {
    slug: 'ky-su',
    title: 'Kỹ sư',
    description: 'Không gian làm việc dành cho kỹ sư khảo sát và xử lý dữ liệu.',
  },
  {
    slug: 'quan-tri-vien',
    title: 'Quản trị viên',
    description: 'Khu vực quản lý người dùng và vận hành hệ thống.',
  },
  {
    slug: 'quan-ly-khu-vuc',
    title: 'Quản lý khu vực',
    description: 'Quản lý tài khoản Kỹ sư và Người xem trong khu vực được giao.',
  },
  {
    slug: 'nguoi-xem-ban-do',
    title: 'Người xem bản đồ',
    description: 'Truy cập bản đồ và tra cứu thông tin địa điểm.',
  },
] as const;

export type LoginRole = (typeof LOGIN_ROLES)[number];
export type LoginRoleSlug = LoginRole['slug'];
