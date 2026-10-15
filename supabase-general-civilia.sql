-- Agrega la región "General Civilia".
-- Ejecutar en Supabase → SQL Editor (amplía el CHECK de projects.region).

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_region_check;
ALTER TABLE projects ADD CONSTRAINT projects_region_check
  CHECK (region IN ('Osorno', 'Santiago', 'Valdivia', 'Concepción', 'Temuco', 'General Civilia'));

INSERT INTO regions (name, client_token)
  VALUES ('General Civilia', 'general-civilia-rev-nd')
  ON CONFLICT DO NOTHING;
