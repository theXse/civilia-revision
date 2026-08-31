export type ProjectStats = {
  comments: number
  changes: number
  total: number
  approved: number
}

export type ResumenProject = {
  name: string
  stats?: ProjectStats
}

export type ResumenRegion = {
  region: string
  projects: ResumenProject[]
}

const EMPTY: ProjectStats = { comments: 0, changes: 0, total: 0, approved: 0 }

/** Un proyecto está listo cuando tiene láminas y todas están aprobadas. */
export function isProjectApproved(stats?: ProjectStats): boolean {
  const s = stats ?? EMPTY
  return s.total > 0 && s.total === s.approved
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Detalle de lo que falta en un proyecto: "5/12 aprobadas · 3 con cambios · 2 comentarios" */
function pendingDetail(stats?: ProjectStats): string {
  const s = stats ?? EMPTY
  if (s.total === 0) return 'sin láminas aún'
  const parts = [`${s.approved}/${s.total} aprobadas`]
  if (s.changes > 0) parts.push(`${s.changes} con cambios`)
  if (s.comments > 0) parts.push(plural(s.comments, 'comentario', 'comentarios'))
  return parts.join(' · ')
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Arma el texto del resumen listo para pegar en WhatsApp.
 * Usa *negrita* de WhatsApp y agrupa por región: primero lo aprobado, después lo que falta.
 */
export function buildWhatsappResumen(regions: ResumenRegion[], date: Date = new Date()): string {
  const lines: string[] = [`*Estado de láminas* · ${formatDate(date)}`]

  let totalListos = 0
  let totalProyectos = 0

  for (const { region, projects } of regions) {
    lines.push('')
    const listos = projects.filter(p => isProjectApproved(p.stats))
    const faltan = projects.filter(p => !isProjectApproved(p.stats))
    totalListos += listos.length
    totalProyectos += projects.length

    if (projects.length === 0) {
      lines.push(`*${region.toUpperCase()}*`)
      lines.push('_Sin proyectos activos_')
      continue
    }

    lines.push(`*${region.toUpperCase()}* (${listos.length}/${projects.length} listos)`)

    if (listos.length > 0) {
      lines.push('✅ Aprobado:')
      for (const p of listos) {
        lines.push(`• ${p.name} — ${plural(p.stats?.total ?? 0, 'lámina', 'láminas')}`)
      }
    }

    if (faltan.length > 0) {
      lines.push('⏳ Falta:')
      for (const p of faltan) {
        lines.push(`• ${p.name} — ${pendingDetail(p.stats)}`)
      }
    }
  }

  lines.push('')
  lines.push(
    totalListos === totalProyectos
      ? `*Todo aprobado* (${totalProyectos} proyectos) 🎉`
      : `*Total:* ${totalListos}/${totalProyectos} proyectos aprobados`
  )

  return lines.join('\n')
}
