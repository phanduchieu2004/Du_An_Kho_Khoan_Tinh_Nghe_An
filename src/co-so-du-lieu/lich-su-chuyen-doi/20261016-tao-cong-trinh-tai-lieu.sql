CREATE TABLE IF NOT EXISTS cong_trinh_tai_lieu (
  id SERIAL PRIMARY KEY,
  cong_trinh_id integer NOT NULL REFERENCES cong_trinh(id) ON DELETE CASCADE,
  loai_tai_lieu varchar(100) NOT NULL,
  ten_file varchar(255) NOT NULL,
  ten_luu_tru varchar(255) NOT NULL UNIQUE,
  mime_type varchar(255) NOT NULL,
  kich_thuoc bigint NOT NULL,
  ngay_tao timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cong_trinh_tai_lieu_cong_trinh_id
  ON cong_trinh_tai_lieu (cong_trinh_id);
