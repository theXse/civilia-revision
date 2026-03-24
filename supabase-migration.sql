-- Crear tabla regions para links de cliente por región
CREATE TABLE IF NOT EXISTS regions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  client_token text UNIQUE NOT NULL
);

-- Insertar las 4 regiones con sus tokens únicos
INSERT INTO regions (name, client_token) VALUES
  ('Osorno',     'osorno-rev-7x3k'),
  ('Santiago',   'santiago-rev-4m9p'),
  ('Valdivia',   'valdivia-rev-2n6w'),
  ('Concepción', 'concepcion-rev-8q1f');
