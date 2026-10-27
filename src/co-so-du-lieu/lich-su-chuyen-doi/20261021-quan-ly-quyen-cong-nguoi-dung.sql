ALTER TABLE nguoi_dung
  ADD COLUMN IF NOT EXISTS cong_vai_tro varchar(32)[] NOT NULL
    DEFAULT ARRAY['nguoi-xem-ban-do']::varchar(32)[],
  ADD COLUMN IF NOT EXISTS duoc_dang_nhap boolean NOT NULL DEFAULT true;

ALTER TABLE nguoi_dung
  ALTER COLUMN cong_vai_tro
    SET DEFAULT ARRAY['nguoi-xem-ban-do']::varchar(32)[];

UPDATE nguoi_dung
SET cong_vai_tro = CASE ten_dang_nhap
  WHEN 'admin' THEN ARRAY['quan-tri-vien']::varchar(32)[]
  WHEN 'kysu01' THEN ARRAY['ky-su']::varchar(32)[]
  WHEN 'nguoixem01' THEN ARRAY['nguoi-xem-ban-do']::varchar(32)[]
  ELSE ARRAY['nguoi-xem-ban-do']::varchar(32)[]
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_nguoi_dung_cong_vai_tro'
  ) THEN
    ALTER TABLE nguoi_dung
      ADD CONSTRAINT chk_nguoi_dung_cong_vai_tro
      CHECK (
        cardinality(cong_vai_tro) > 0
        AND cong_vai_tro <@ ARRAY[
          'ky-su',
          'quan-tri-vien',
          'nguoi-xem-ban-do'
        ]::varchar(32)[]
      );
  END IF;
END $$;
