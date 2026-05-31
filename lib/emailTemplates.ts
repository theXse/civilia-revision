export const REGION_EMAILS: Record<string, string> = {
  'Osorno': 'slyon@civilia.cl',
  'Santiago': 'mmardones@civilia.cl',
  'Valdivia': 'jprovis@civilia.cl',
  'Concepción': 'cvargas@civilia.cl',
}

export const REGION_NAMES: Record<string, string> = {
  'Osorno': 'Santiago',
  'Santiago': 'Mauro',
  'Valdivia': 'Jorge',
  'Concepción': 'Carlos',
}

const LOGO_URL = 'https://civilia-revision.vercel.app/logo.png'

function emailWrapper(content: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <!-- Header -->
        <tr><td style="background:#1e2a36;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
          <img src="${LOGO_URL}" alt="La Ruta" height="36" style="display:inline-block" />
        </td></tr>
        <!-- Content -->
        <tr><td style="background:white;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;padding:20px 32px;text-align:center">
          <p style="margin:0;font-size:12px;color:#94a3b8">Equipo La Ruta · civilia-revision.vercel.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export type NotificationItem = {
  project_name: string
  delivery_name: string
  delivery_id: string
  facebook_link?: string
  approval_token?: string
}

export function buildLinkApprovalEmail(region: string, items: NotificationItem[], baseUrl: string) {
  const clientName = REGION_NAMES[region] || 'Cliente'
  const subject = items.length === 1
    ? `Aprobación de campaña — ${items[0].project_name}`
    : `Aprobación de campañas — ${region} (${items.length})`

  const itemsHtml = items.map(item => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:16px">
      <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1e293b">${item.project_name}</p>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b">${item.delivery_name} · ${region}</p>
      ${item.facebook_link ? `
      <a href="${item.facebook_link}" style="display:inline-block;margin-bottom:16px;background:#1877f2;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600">
        📱 Ver preview del material
      </a>` : ''}
      ${item.approval_token ? `
      <br>
      <a href="${baseUrl}/api/approve/${item.approval_token}" style="display:inline-block;margin-top:${item.facebook_link ? '8px' : '0'};background:#16a34a;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700">
        ✓ Aprobar publicación
      </a>` : ''}
    </div>
  `).join('')

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:#1e293b">Estimado <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
      Te enviamos este correo para que puedas revisar y aprobar el siguiente material antes de publicarlo en Instagram.
      Una vez que presiones <strong>Aprobar publicación</strong>, el equipo procederá a publicarlo y quedará activo.
    </p>
    ${itemsHtml}
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;line-height:1.6">
      Si tienes alguna duda o cambio, responde este correo y te contactamos de inmediato.<br><br>
      Muchas gracias,<br>
      <strong style="color:#1e293b">Equipo La Ruta</strong>
    </p>
  `

  return { subject, html: emailWrapper(content) }
}

export function buildSubidoIGEmail(region: string, items: NotificationItem[]) {
  const clientName = REGION_NAMES[region] || 'Cliente'
  const subject = items.length === 1
    ? `✅ Publicado en Instagram — ${items[0].project_name}`
    : `✅ Publicaciones en Instagram — ${region} (${items.length})`

  const itemsHtml = items.map(item => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:12px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1e293b">${item.project_name}</p>
      <p style="margin:0;font-size:13px;color:#64748b">${item.delivery_name} · ${region}</p>
    </div>
  `).join('')

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:#1e293b">Estimado <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
      Te informamos que ${items.length === 1 ? 'la siguiente campaña fue publicada' : 'las siguientes campañas fueron publicadas'} exitosamente en Instagram:
    </p>
    ${itemsHtml}
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;line-height:1.6">
      Muchas gracias por tu confianza.<br><br>
      <strong style="color:#1e293b">Equipo La Ruta</strong>
    </p>
  `

  return { subject, html: emailWrapper(content) }
}

export function buildProblemEmail(projectName: string, deliveryName: string, region: string, problemNotes: string) {
  const subject = `⚠️ Problema reportado — ${projectName}`

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:#1e293b">Hola <strong>Ximena</strong>,</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">
      Erika reportó un problema en el siguiente proyecto:
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-bottom:20px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1e293b">${projectName}</p>
      ${deliveryName ? `<p style="margin:0 0 12px;font-size:13px;color:#64748b">${deliveryName} · ${region}</p>` : `<p style="margin:0 0 12px;font-size:13px;color:#64748b">${region}</p>`}
      <p style="margin:0;font-size:14px;color:#dc2626;font-weight:500">⚠️ ${problemNotes}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#64748b">Reportado por Erika — La Ruta</p>
  `

  return { subject, html: emailWrapper(content) }
}

export function buildApprovalConfirmEmail(projectName: string, deliveryName: string, region: string) {
  const clientName = REGION_NAMES[region] || 'el cliente'
  const subject = `✅ Campaña aprobada — ${projectName}`

  const content = `
    <p style="margin:0 0 24px;font-size:16px;color:#1e293b">¡Buenas noticias!</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6">
      <strong>${clientName}</strong> aprobó la siguiente campaña:
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1e293b">${projectName}</p>
      <p style="margin:0;font-size:13px;color:#64748b">${deliveryName} · ${region}</p>
    </div>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b">
      Ya pueden proceder con la publicación en Instagram.<br><br>
      <strong style="color:#1e293b">Sistema La Ruta</strong>
    </p>
  `

  return { subject, html: emailWrapper(content) }
}
