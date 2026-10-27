ALTER TABLE cong_trinh
  ADD COLUMN IF NOT EXISTS nguoi_tao INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cong_trinh_nguoi_tao_fkey'
      AND conrelid = 'cong_trinh'::regclass
  ) THEN
    ALTER TABLE cong_trinh
      ADD CONSTRAINT cong_trinh_nguoi_tao_fkey
      FOREIGN KEY (nguoi_tao)
      REFERENCES nguoi_dung(ma_nguoi_dung)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS cong_trinh_nguoi_tao_idx
  ON cong_trinh (nguoi_tao, ngay_tao DESC);
