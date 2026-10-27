CREATE TABLE IF NOT EXISTS uy_quyen_he_thong (
  id smallint PRIMARY KEY CHECK (id = 1),
  quyen_duoc_cap text[] NOT NULL
);

INSERT INTO uy_quyen_he_thong (id, quyen_duoc_cap)
VALUES (
  1,
  ARRAY[
    'kham-pha-ban-do',
    'cong-trinh',
    'tao-cong-trinh',
    'duyet-cong-trinh',
    'phan-bo-cong-trinh',
    'huy-phan-cong',
    'ho-khoan',
    'lop-dat',
    'mau-thi-nghiem',
    'thanh-phan-hat',
    'cat-phang',
    'gia-tri-trung-binh-lop',
    'mat-bang',
    'nguoi-dung',
    'vai-tro',
    'quan-ly-khu-vuc',
    'xuat-du-lieu',
    'thao-tac-ban-ghi',
    'tai-len'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS uy_quyen_tai_khoan (
  ma_nguoi_dung integer PRIMARY KEY,
  quyen_duoc_cap text[] NOT NULL,
  nut_theo_trang jsonb NOT NULL DEFAULT '{}'::jsonb,
  che_do_quyen jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE uy_quyen_tai_khoan
  ADD COLUMN IF NOT EXISTS nut_theo_trang jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE uy_quyen_tai_khoan
  ADD COLUMN IF NOT EXISTS che_do_quyen jsonb NOT NULL DEFAULT '{}'::jsonb;
