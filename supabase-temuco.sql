-- Agrega la región Temuco.
-- La fila en `regions` ya fue creada (client_token temuco-rev-qk8t);
-- falta ampliar el CHECK de projects.region para que acepte 'Temuco'.
-- Ejecutar en Supabase → SQL Editor.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_region_check;
ALTER TABLE projects ADD CONSTRAINT projects_region_check
  CHECK (region IN ('Osorno', 'Santiago', 'Valdivia', 'Concepción', 'Temuco'));

INSERT INTO regions (name, client_token)
  VALUES ('Temuco', 'temuco-rev-qk8t')
  ON CONFLICT DO NOTHING;
