ALTER TABLE cong_trinh_phan_cong
  ADD COLUMN IF NOT EXISTS trang_thai_phan_bo TEXT NOT NULL DEFAULT 'da_phan_bo';
