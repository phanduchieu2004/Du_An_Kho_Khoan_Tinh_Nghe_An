ALTER TABLE nguoi_dung
  ADD COLUMN IF NOT EXISTS khu_vuc_phan_cong_ranh_gioi JSONB,
  ADD COLUMN IF NOT EXISTS khu_vuc_phan_cong_vi_do DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS khu_vuc_phan_cong_kinh_do DOUBLE PRECISION;
+