CREATE TABLE IF NOT EXISTS ho_tro_yeu_cau (
  id BIGSERIAL PRIMARY KEY,
  engineer_id INTEGER NOT NULL
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  tieu_de VARCHAR(200) NOT NULL,
  loai_hoi_thoai VARCHAR(20) NOT NULL DEFAULT 'admin'
    CHECK (loai_hoi_thoai IN ('admin', 'ky-su')),
  recipient_id INTEGER
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_phan_hoi'
    CHECK (trang_thai IN ('cho_phan_hoi', 'da_tra_loi')),
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_cap_nhat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ho_tro_yeu_cau
  ADD COLUMN IF NOT EXISTS loai_hoi_thoai VARCHAR(20) NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS recipient_id INTEGER
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ho_tro_tin_nhan_direct_pair
  ON ho_tro_yeu_cau (
    LEAST(engineer_id, recipient_id),
    GREATEST(engineer_id, recipient_id)
  )
  WHERE loai_hoi_thoai = 'ky-su';

CREATE TABLE IF NOT EXISTS ho_tro_tin_nhan (
  id BIGSERIAL PRIMARY KEY,
  yeu_cau_id BIGINT NOT NULL
    REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
  sender_id INTEGER
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE SET NULL,
  sender_role VARCHAR(20) NOT NULL
    CHECK (sender_role IN ('ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc')),
  sender_name VARCHAR(255) NOT NULL,
  sender_email VARCHAR(255),
  noi_dung TEXT NOT NULL CHECK (length(btrim(noi_dung)) BETWEEN 1 AND 5000),
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ho_tro_tin_nhan
  DROP CONSTRAINT IF EXISTS ho_tro_tin_nhan_sender_role_check;

ALTER TABLE ho_tro_tin_nhan
  ADD CONSTRAINT ho_tro_tin_nhan_sender_role_check
  CHECK (sender_role IN ('ky-su', 'quan-tri-vien', 'quan-ly-khu-vuc'));

CREATE INDEX IF NOT EXISTS ho_tro_yeu_cau_engineer_updated
  ON ho_tro_yeu_cau (engineer_id, ngay_cap_nhat DESC);

CREATE INDEX IF NOT EXISTS ho_tro_tin_nhan_thread
  ON ho_tro_tin_nhan (yeu_cau_id, id);

CREATE TABLE IF NOT EXISTS ho_tro_admin_da_doc (
  admin_id INTEGER NOT NULL
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  yeu_cau_id BIGINT NOT NULL
    REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  ngay_doc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id, yeu_cau_id)
);

CREATE TABLE IF NOT EXISTS ho_tro_tai_khoan_da_doc (
  account_id INTEGER NOT NULL
    REFERENCES nguoi_dung(ma_nguoi_dung) ON DELETE CASCADE,
  yeu_cau_id BIGINT NOT NULL
    REFERENCES ho_tro_yeu_cau(id) ON DELETE CASCADE,
  last_read_message_id BIGINT NOT NULL DEFAULT 0,
  ngay_doc TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, yeu_cau_id)
);
