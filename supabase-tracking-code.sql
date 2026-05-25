-- ─────────────────────────────────────────────────────────────
-- Tracking code para láminas (cruce con campañas Meta/Google Ads)
-- Formato: LR-[REG3]-[YYMM]-[NNNN]
--   LR    = La Ruta
--   REG3  = OSO | STG | VAL | CON (primeras 3 letras de la región, mayúsculas)
--   YYMM  = año+mes de creación
--   NNNN  = secuencia por (región, año+mes), 4 dígitos con padding
-- Ejemplo: LR-OSO-2605-0042
-- ─────────────────────────────────────────────────────────────

ALTER TABLE images ADD COLUMN IF NOT EXISTS tracking_code text UNIQUE;

CREATE INDEX IF NOT EXISTS images_tracking_code_idx ON images (tracking_code);

-- Función que arma el código mirando la región del proyecto vinculado
CREATE OR REPLACE FUNCTION assign_image_tracking_code()
RETURNS TRIGGER AS $$
DECLARE
  v_region text;
  v_reg3 text;
  v_yymm text;
  v_prefix text;
  v_seq int;
BEGIN
  IF NEW.tracking_code IS NOT NULL AND NEW.tracking_code <> '' THEN
    RETURN NEW;
  END IF;

  SELECT p.region INTO v_region
  FROM deliveries d
  JOIN projects p ON p.id = d.project_id
  WHERE d.id = NEW.delivery_id;

  IF v_region IS NULL THEN
    v_region := 'XXX';
  END IF;

  -- Mapeo region → 3 letras
  v_reg3 := CASE lower(v_region)
    WHEN 'osorno'      THEN 'OSO'
    WHEN 'santiago'    THEN 'STG'
    WHEN 'valdivia'    THEN 'VAL'
    WHEN 'concepción'  THEN 'CON'
    WHEN 'concepcion'  THEN 'CON'
    ELSE upper(substring(regexp_replace(v_region, '[^a-zA-Z]', '', 'g') from 1 for 3))
  END;

  v_yymm := to_char(COALESCE(NEW.created_at, now()), 'YYMM');
  v_prefix := 'LR-' || v_reg3 || '-' || v_yymm || '-';

  -- Secuencia: siguiente número disponible para este prefijo
  SELECT COALESCE(MAX(CAST(substring(tracking_code FROM length(v_prefix) + 1) AS int)), 0) + 1
  INTO v_seq
  FROM images
  WHERE tracking_code LIKE v_prefix || '%';

  NEW.tracking_code := v_prefix || lpad(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS images_assign_tracking_code ON images;
CREATE TRIGGER images_assign_tracking_code
  BEFORE INSERT ON images
  FOR EACH ROW
  EXECUTE FUNCTION assign_image_tracking_code();

-- Backfill: asignar código a imágenes existentes (en orden de creación)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM images WHERE tracking_code IS NULL ORDER BY created_at, id
  LOOP
    UPDATE images SET tracking_code = NULL WHERE id = r.id;
    -- forzar trigger con un UPDATE dummy no sirve; usamos llamada directa:
    PERFORM 1;
  END LOOP;
END $$;

-- Backfill real: re-ejecuta la lógica del trigger sobre filas existentes
UPDATE images SET tracking_code = NULL WHERE tracking_code IS NULL;

WITH ordered AS (
  SELECT
    i.id,
    p.region,
    to_char(i.created_at, 'YYMM') AS yymm,
    row_number() OVER (
      PARTITION BY p.region, to_char(i.created_at, 'YYMM')
      ORDER BY i.created_at, i.id
    ) AS seq
  FROM images i
  JOIN deliveries d ON d.id = i.delivery_id
  JOIN projects p ON p.id = d.project_id
  WHERE i.tracking_code IS NULL
)
UPDATE images i
SET tracking_code =
  'LR-' ||
  CASE lower(o.region)
    WHEN 'osorno'     THEN 'OSO'
    WHEN 'santiago'   THEN 'STG'
    WHEN 'valdivia'   THEN 'VAL'
    WHEN 'concepción' THEN 'CON'
    WHEN 'concepcion' THEN 'CON'
    ELSE upper(substring(regexp_replace(o.region, '[^a-zA-Z]', '', 'g') from 1 for 3))
  END ||
  '-' || o.yymm || '-' || lpad(o.seq::text, 4, '0')
FROM ordered o
WHERE i.id = o.id;
