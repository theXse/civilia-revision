---
name: subir-material
description: Sube material gráfico (rar/zip/carpeta con imágenes) a la plataforma Civilia — crea el proyecto en su región si no existe, crea las carpetas (deliveries) y sube las láminas. Usar cuando el usuario pida "sube este rar/material a [región]", "carga las láminas de [proyecto]" o similar.
---

# Subir material a la plataforma Civilia

Flujo completo para subir láminas nuevas. El trabajo pesado lo hace
`scripts/subir-material.mjs` (sin dependencias, solo Node + fetch).

## Pasos

1. **Identifica el archivo/carpeta origen.** Normalmente un `.rar` o `.zip` en
   `~/Downloads` (los de WeTransfer se llaman `wetransfer_..._HHMM`). Puede ser
   el archivo directo, o una carpeta que contiene el rar dentro — el script
   maneja ambos casos.

2. **Identifica región y proyecto.** La región es una de: Osorno, Santiago,
   Valdivia, Concepción. El proyecto suele venir en el nombre del archivo
   (ej: "green-conce" → proyecto Green, región Concepción). Si no está claro,
   pregunta al usuario ANTES de subir.

3. **Corre el dry-run** (no toca la base de datos):
   ```bash
   node scripts/subir-material.mjs <ruta> --region <Región> --proyecto <Nombre>
   ```
   Esto descomprime, detecta las carpetas y muestra el PLAN: qué proyecto se
   usa/crea y qué carpetas con cuántas imágenes.

4. **Muestra el plan al usuario y espera su OK.** Ojo especial con:
   - `⚠️ hay proyectos con nombre parecido` → probablemente hay que usar el
     existente, no crear uno nuevo. Confirma con el usuario el nombre exacto.
   - Carpetas con nombres raros (ej: carpeta envoltorio del rar como categoría).

5. **Ejecuta de verdad** agregando `--si`:
   ```bash
   node scripts/subir-material.mjs <ruta> --region <Región> --proyecto <Nombre> --si
   ```

6. **Reporta al usuario:** cuántas imágenes por carpeta y el link admin
   `/a/{admin_token}` que imprime el script.

## Detalles útiles

- Requiere `.env.local` en la raíz (las credenciales están en AGENTS.md).
- Para `.rar` necesita `unrar`, `7zz`, `7z` o `bsdtar`. En Mac: `brew install sevenzip`.
- El script es **idempotente**: si se corre dos veces, omite imágenes que ya
  existen con el mismo nombre en la misma carpeta (`--duplicar` para forzar).
- Si el material trae estructura `Región/Proyecto/Categoría/...` la detecta solo;
  si trae solo carpetas de categorías (lo normal), usa `--region`/`--proyecto`.
- `--scan-only` analiza el material sin conectarse a nada (para inspeccionar).
- Convención de carpetas de meses anteriores: CARRUSEL GENERAL, ESPACIOS COMUNES,
  PADRES UNIVERSITARIOS, SALUD, INVERSIONISTA, RETARGETING (varía por mes/proyecto —
  respeta los nombres de las carpetas del rar).
