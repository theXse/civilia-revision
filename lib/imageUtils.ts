/**
 * Convierte una URL de Supabase Storage a una URL de thumbnail.
 * Usa el endpoint render/image de Supabase para servir imágenes redimensionadas.
 * En el grid mostramos thumbnails ~600px en vez de la imagen original.
 */
export function thumbUrl(url: string, width = 600, quality = 75): string {
  if (!url.includes('/storage/v1/object/public/')) return url
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    `?width=${width}&quality=${quality}`
  )
}

// Placeholder blur: rect gris oscuro 1x1 en base64
export const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiMxZTJhMzYiLz48L3N2Zz4='
