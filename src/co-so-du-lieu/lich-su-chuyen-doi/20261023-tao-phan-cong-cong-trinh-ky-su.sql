CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong (
  id BIGSERIAL PRIMARY KEY,
  ma_nguoi_dung INTEGER NOT NULL REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  cong_trinh_id INTEGER NOT NULL REFERENCES cong_trinh(id) ON DELETE CASCADE,
  tu_ngay DATE,
  den_ngay DATE,
  khu_vuc TEXT NOT NULL,
  ranh_gioi JSONB NOT NULL,
  vi_do DOUBLE PRECISION NOT NULL,
  kinh_do DOUBLE PRECISION NOT NULL,
  trang_thai_phan_bo TEXT NOT NULL DEFAULT 'da_phan_bo',
  da_hoan_thanh BOOLEAN NOT NULL DEFAULT FALSE,
  dang_hieu_luc BOOLEAN NOT NULL DEFAULT TRUE,
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_cap_nhat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cong_trinh_phan_cong_ngay_hop_le CHECK (
    (tu_ngay IS NULL AND den_ngay IS NULL) OR
    (tu_ngay IS NOT NULL AND den_ngay IS NOT NULL AND tu_ngay <= den_ngay)
  )
);

ALTER TABLE cong_trinh_phan_cong
  ALTER COLUMN tu_ngay DROP NOT NULL,
  ALTER COLUMN den_ngay DROP NOT NULL;

ALTER TABLE cong_trinh_phan_cong
  DROP CONSTRAINT IF EXISTS cong_trinh_phan_cong_ngay_hop_le;

ALTER TABLE cong_trinh_phan_cong
  ADD CONSTRAINT cong_trinh_phan_cong_ngay_hop_le CHECK (
    (tu_ngay IS NULL AND den_ngay IS NULL) OR
    (tu_ngay IS NOT NULL AND den_ngay IS NOT NULL AND tu_ngay <= den_ngay)
  );

DROP INDEX IF EXISTS cong_trinh_phan_cong_moi_cong_trinh;

CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_moi_cong_trinh
  ON cong_trinh_phan_cong (ma_nguoi_dung, cong_trinh_id)
  WHERE dang_hieu_luc;

CREATE INDEX IF NOT EXISTS cong_trinh_phan_cong_nguoi_dung
  ON cong_trinh_phan_cong (ma_nguoi_dung, dang_hieu_luc, tu_ngay, den_ngay);

WITH legacy_assignments AS (
  SELECT DISTINCT ON (u.ma_nguoi_dung, c.id)
    u.ma_nguoi_dung,
    c.id AS cong_trinh_id,
    u.khu_vuc_phan_cong_tu_ngay AS tu_ngay,
    u.khu_vuc_phan_cong_den_ngay AS den_ngay,
    u.khu_vuc_duoc_xem AS khu_vuc,
    u.khu_vuc_phan_cong_ranh_gioi AS ranh_gioi,
    u.khu_vuc_phan_cong_vi_do AS vi_do,
    u.khu_vuc_phan_cong_kinh_do AS kinh_do
  FROM nguoi_dung u
  JOIN mat_bang m ON ST_Intersects(
    ST_MakeValid(m.ranh_gioi),
    ST_MakeValid(
      ST_SetSRID(ST_GeomFromGeoJSON(u.khu_vuc_phan_cong_ranh_gioi::text), 4326)
    )
  )
  JOIN cong_trinh c ON c.id = m.cong_trinh_id
  WHERE u.duoc_dang_nhap IS TRUE
    AND u.cong_vai_tro @> ARRAY['ky-su']::varchar(32)[]
    AND u.khu_vuc_duoc_xem IS NOT NULL
    AND u.khu_vuc_phan_cong_ranh_gioi IS NOT NULL
    AND u.khu_vuc_phan_cong_vi_do IS NOT NULL
    AND u.khu_vuc_phan_cong_kinh_do IS NOT NULL
  ORDER BY u.ma_nguoi_dung, c.id, m.id
)
INSERT INTO cong_trinh_phan_cong (
  ma_nguoi_dung, cong_trinh_id, tu_ngay, den_ngay, khu_vuc,
  ranh_gioi, vi_do, kinh_do
)
SELECT
  legacy.ma_nguoi_dung,
  legacy.cong_trinh_id,
  legacy.tu_ngay,
  legacy.den_ngay,
  legacy.khu_vuc,
  legacy.ranh_gioi,
  legacy.vi_do,
  legacy.kinh_do
FROM legacy_assignments legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM cong_trinh_phan_cong existing
  WHERE existing.ma_nguoi_dung = legacy.ma_nguoi_dung
    AND existing.cong_trinh_id = legacy.cong_trinh_id
    AND existing.dang_hieu_luc
);
