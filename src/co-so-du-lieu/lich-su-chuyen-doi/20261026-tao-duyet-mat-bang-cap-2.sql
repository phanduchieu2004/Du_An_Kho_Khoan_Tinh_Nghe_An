ALTER TABLE mat_bang
  ADD COLUMN IF NOT EXISTS mat_bang_cap_1_id INTEGER;

ALTER TABLE mat_bang
  ADD COLUMN IF NOT EXISTS mat_bang_cha_id INTEGER;

UPDATE mat_bang
SET mat_bang_cha_id = mat_bang_cap_1_id
WHERE mat_bang_cha_id IS NULL
  AND mat_bang_cap_1_id IS NOT NULL
  AND REGEXP_REPLACE(TRIM(cap_mat_bang::text), '\.0+$', '') = '2';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_bang_cap_1_id_fkey'
  ) THEN
    ALTER TABLE mat_bang
      ADD CONSTRAINT mat_bang_cap_1_id_fkey
      FOREIGN KEY (mat_bang_cap_1_id)
      REFERENCES mat_bang(id) ON DELETE SET NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_bang_mat_bang_cha_id_fkey'
  ) THEN
    ALTER TABLE mat_bang
      ADD CONSTRAINT mat_bang_mat_bang_cha_id_fkey
      FOREIGN KEY (mat_bang_cha_id)
      REFERENCES mat_bang(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS mat_bang_cap_1_id_idx
  ON mat_bang (mat_bang_cap_1_id);

CREATE INDEX IF NOT EXISTS mat_bang_mat_bang_cha_id_idx
  ON mat_bang (mat_bang_cha_id);

CREATE TABLE IF NOT EXISTS mat_bang_cap_2_cho_duyet (
  id BIGSERIAL PRIMARY KEY,
  cong_trinh_id INTEGER NOT NULL
    REFERENCES cong_trinh(id) ON DELETE CASCADE,
  mat_bang_cap_1_id INTEGER NOT NULL
    REFERENCES mat_bang(id) ON DELETE CASCADE,
  mat_bang_cha_id INTEGER
    REFERENCES mat_bang(id) ON DELETE CASCADE,
  cap_mat_bang VARCHAR(20) NOT NULL DEFAULT '2',
  ten_mat_bang TEXT NOT NULL,
  loai_mat_bang TEXT NOT NULL,
  ranh_gioi JSONB NOT NULL,
  ma_he_toa_do_nguon TEXT NOT NULL,
  nguoi_yeu_cau TEXT NOT NULL,
  nguoi_duyet TEXT,
  trang_thai VARCHAR(20) NOT NULL DEFAULT 'cho_duyet'
    CHECK (trang_thai IN ('cho_duyet', 'da_duyet')),
  ngay_tao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ngay_xu_ly TIMESTAMP
);

ALTER TABLE mat_bang_cap_2_cho_duyet
  ADD COLUMN IF NOT EXISTS mat_bang_cha_id INTEGER
    REFERENCES mat_bang(id) ON DELETE CASCADE;

ALTER TABLE mat_bang_cap_2_cho_duyet
  ADD COLUMN IF NOT EXISTS cap_mat_bang VARCHAR(20) NOT NULL DEFAULT '2';

UPDATE mat_bang_cap_2_cho_duyet
SET mat_bang_cha_id = mat_bang_cap_1_id
WHERE mat_bang_cha_id IS NULL;

CREATE INDEX IF NOT EXISTS mat_bang_cap_2_cho_duyet_trang_thai_idx
  ON mat_bang_cap_2_cho_duyet (trang_thai, ngay_tao, id);
