import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  // Fetch everything in parallel
  const [
    { data: projects },
    { data: deliveries },
    { data: images },
    { data: comments },
    { data: projectComments },
  ] = await Promise.all([
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase.from('deliveries').select('*'),
    supabase.from('images').select('*').order('sort_order'),
    supabase.from('comments').select('*').order('created_at'),
    supabase.from('project_comments').select('*').order('created_at'),
  ])

  if (!projects) return NextResponse.json({ error: 'Error fetching data' }, { status: 500 })

  const lines: string[] = []
  const now = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

  lines.push(`# Historial completo — Plataforma Civilia / La Ruta`)
  lines.push(`Exportado el ${now}`)
  lines.push(`Total proyectos: ${projects.length} (${projects.filter(p => !p.archived).length} activos, ${projects.filter(p => p.archived).length} archivados)`)
  lines.push('')

  // Group projects by region
  const regions = ['Osorno', 'Santiago', 'Valdivia', 'Concepción']
  for (const region of regions) {
    const regionProjects = projects.filter(p => p.region === region)
    if (regionProjects.length === 0) continue

    lines.push(`---`)
    lines.push(`## ${region.toUpperCase()} (${regionProjects.length} proyectos)`)
    lines.push('')

    for (const project of regionProjects) {
      const status = project.archived
        ? `Archivado${project.archived_at ? ` (${new Date(project.archived_at).toLocaleDateString('es-CL')})` : ''}`
        : 'Activo'
      const igStatus = project.ready_for_social
        ? 'Subido a Instagram'
        : project.listo_para_ig
        ? 'Listo para IG (pendiente subir)'
        : 'Sin gráficas en Drive'

      lines.push(`### ${project.name}`)
      lines.push(`- **Estado:** ${status}`)
      lines.push(`- **Instagram:** ${igStatus}`)
      lines.push(`- **Creado:** ${new Date(project.created_at).toLocaleDateString('es-CL')}`)
      if (project.notes?.trim()) {
        lines.push(`- **Notas internas:** ${project.notes.trim()}`)
      }

      // Project-level comments
      const projComments = (projectComments || []).filter(c => c.project_id === project.id)
      if (projComments.length > 0) {
        lines.push(`- **Comentarios generales del proyecto:**`)
        for (const c of projComments) {
          lines.push(`  - [${c.author || 'Cliente'}] ${c.content}`)
        }
      }

      // Deliveries
      const projDeliveries = (deliveries || []).filter(d => d.project_id === project.id)
      if (projDeliveries.length === 0) {
        lines.push('')
        continue
      }

      for (const delivery of projDeliveries) {
        const deliveryImages = (images || []).filter(i => i.delivery_id === delivery.id)
        if (deliveryImages.length === 0) continue

        lines.push(``)
        lines.push(`#### Entrega: ${delivery.name}`)

        const approved = deliveryImages.filter(i => i.status === 'approved').length
        const changes = deliveryImages.filter(i => i.status === 'changes_requested').length
        const pending = deliveryImages.filter(i => i.status === 'pending').length
        const revised = deliveryImages.filter(i => i.status === 'revised').length
        lines.push(`${deliveryImages.length} láminas — ✓ ${approved} aprobadas, ✏ ${changes} con cambios, ↩ ${revised} revisadas, ⏳ ${pending} pendientes`)

        for (const img of deliveryImages) {
          const statusLabel: Record<string, string> = {
            approved: '✓ Aprobada',
            changes_requested: '✏ Cambios pedidos',
            revised: '↩ Revisada',
            pending: '⏳ Pendiente',
          }
          const imgComments = (comments || []).filter(c => c.image_id === img.id)
          const igIcon = img.on_instagram ? ' [En Instagram]' : ''

          lines.push(``)
          lines.push(`**${img.name || `Lámina`}** — ${statusLabel[img.status] || img.status}${igIcon}`)

          if (imgComments.length > 0) {
            for (const c of imgComments) {
              lines.push(`> 💬 [${c.author || 'Cliente'}]: ${c.content}`)
              if (c.reply?.trim()) {
                lines.push(`> ↳ [Admin]: ${c.reply.trim()}`)
              }
              if (c.resolved) {
                lines.push(`> ✓ Resuelto`)
              }
            }
          }
        }
      }

      lines.push('')
    }
  }

  lines.push('---')
  lines.push('*Exportado desde Civilia — plataforma de revisión de láminas de La Ruta*')

  const markdown = lines.join('\n')

  return new NextResponse(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="civilia-historial-${new Date().toISOString().split('T')[0]}.md"`,
    },
  })
}
