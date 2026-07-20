-- Mockup de Instagram: copy (caption) del post, editable por entrega
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS ig_caption TEXT;

-- Copy inicial para el proyecto JDN (solo entregas que aún no tengan copy)
UPDATE deliveries
SET ig_caption = 'Vivir bien no es un lujo, es una decisión. 🏡
Departamentos nuevos de 3D y 2B desde UF 4.534, con piscina, gimnasio, cancha de pádel, cowork y más.
📍 Av. Santa Marta de Huechuraba 6650
Cotiza hoy'
WHERE ig_caption IS NULL
  AND project_id IN (SELECT id FROM projects WHERE name ILIKE '%JDN%');
