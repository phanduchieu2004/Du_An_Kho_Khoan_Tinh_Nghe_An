CREATE TABLE IF NOT EXISTS cong_trinh_phan_cong_gia_han (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL
    REFERENCES cong_trinh_phan_cong(id) ON DELETE CASCADE,
  ma_nguoi_dung INTEGER NOT NULL
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  den_ngay_moi DATE NOT NULL,
  ly_do TEXT NOT NULL CHECK (length(btrim(ly_do)) BETWEEN 5 AND 2000),
  trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
    CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_xu_ly TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS cong_trinh_phan_cong_gia_han_cho_duyet
  ON cong_trinh_phan_cong_gia_han (assignment_id)
  WHERE trang_thai = 'cho_duyet';
