# civilia-revision — Contexto del proyecto

## Qué es este proyecto

Plataforma web de revisión de láminas para **La Ruta**, empresa de arquitectura/construcción.
Permite que clientes revisen láminas de proyectos y dejen comentarios con anotaciones.
Los administradores gestionan proyectos, suben imágenes y responden comentarios.

## Stack

- **Next.js 16.2.1** — tiene breaking changes respecto a versiones anteriores
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** — base de datos PostgreSQL + autenticación + storage de imágenes

## IMPORTANTE: Next.js con breaking changes

<!-- BEGIN:nextjs-agent-rules -->
Esta versión tiene APIs y convenciones diferentes a las que conoces.
**Antes de escribir cualquier código Next.js, lee la documentación en `node_modules/next/dist/docs/`.**
Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Variables de entorno

Crear archivo `.env.local` en la raíz:
```
NEXT_PUBLIC_SUPABASE_URL=https://jgxzjswqgmghlmmrvbhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_OBbKpkzwZyDPn2KPYVjnUQ_ee-oLjd1
```

## Rutas principales

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard admin — 4 ciudades con proyectos |
| `/r/[token]` | Vista del cliente — revisa láminas, aprueba/pide cambios |
| `/a/[token]` | Vista del administrador — gestiona imágenes y comentarios |
| `/a/[token]/resumen` | Resumen del proyecto |
| `/import` | Importación masiva de proyectos por carpetas |

## Estructura de base de datos

- **regions** — 4 ciudades: Osorno, Santiago, Valdivia, Concepción (con `drive_url` y `dropbox_url`)
- **projects** — proyectos por región (con `notes`, `drive_link`, `ready_for_social`, `archived`)
- **deliveries** — categorías/entregas dentro de un proyecto
- **images** — láminas con estado: `pending` | `approved` | `changes_requested`
- **comments** — comentarios por lámina
- **project_comments** — comentarios generales por proyecto

## Cómo trabajamos con Claude Code

- Claude Code usa **git worktrees** para trabajar en ramas aisladas
- Los cambios se hacen en la rama `claude/[nombre]` y luego se hace merge a `main`
- Si hay conflicto al mergear a `main`, resolverlo manualmente integrando ambas versiones
- El repo está en: https://github.com/theXse/civilia-revision

## Flujo para mergear a main

```bash
git checkout main
git pull origin main
git merge claude/[nombre-rama]
git push origin main
```
Si hay conflictos, resolver preservando features de ambas versiones antes de commitear.

## Migraciones de Supabase

Si se agregan columnas nuevas, ejecutar en Supabase SQL Editor.
Ver `supabase-migration.sql` en la raíz para el schema completo.

## Archivos clave

- `app/page.tsx` — dashboard principal con las 4 ciudades
- `app/r/[token]/page.tsx` — vista cliente
- `app/a/[token]/page.tsx` — vista admin
- `lib/supabase.ts` — tipos TypeScript y cliente Supabase
- `lib/imageUtils.ts` — resize y thumbnails de imágenes
- `supabase-migration.sql` — schema completo de la base de datos
