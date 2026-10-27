CREATE TABLE IF NOT EXISTS cong_trinh_sua_doi (
  id BIGSERIAL PRIMARY KEY,
  cong_trinh_id INTEGER NOT NULL
    REFERENCES cong_trinh(id) ON DELETE CASCADE,
  du_lieu_cu JSONB NOT NULL,
  du_lieu_de_xuat JSONB NOT NULL,
  nguoi_yeu_cau TEXT NOT NULL,
  nguoi_duyet TEXT,
  trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
    CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_xu_ly TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_sua_doi_moi_cho_duyet
  ON cong_trinh_sua_doi (cong_trinh_id)
  WHERE trang_thai = 'cho_duyet';

CREATE INDEX IF NOT EXISTS cong_trinh_sua_doi_lich_su
  ON cong_trinh_sua_doi (cong_trinh_id, ngay_xu_ly DESC)
  WHERE trang_thai = 'da_duyet';
