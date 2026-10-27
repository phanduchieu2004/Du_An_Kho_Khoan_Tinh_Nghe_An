ALTER TABLE nguoi_dung
  ADD COLUMN IF NOT EXISTS khu_vuc_phan_cong_tu_ngay DATE,
  ADD COLUMN IF NOT EXISTS khu_vuc_phan_cong_den_ngay DATE;
