-- Crear tabla regions para links de cliente por región
CREATE TABLE IF NOT EXISTS regions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  client_token text UNIQUE NOT NULL,
  drive_url text,
  dropbox_url text
);

-- Migración: agregar columnas de archivos en la nube (si la tabla ya existe)
ALTER TABLE regions ADD COLUMN IF NOT EXISTS drive_url text;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS dropbox_url text;

-- Insertar las 4 regiones con sus tokens únicos
INSERT INTO regions (name, client_token) VALUES
  ('Osorno',     'osorno-rev-7x3k'),
  ('Santiago',   'santiago-rev-4m9p'),
  ('Valdivia',   'valdivia-rev-2n6w'),
  ('Concepción', 'concepcion-rev-8q1f');
