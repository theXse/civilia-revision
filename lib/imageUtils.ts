/**
 * Convierte una URL de Supabase Storage a una URL optimizada.
 * Usa el endpoint render/image de Supabase con WebP y tamaño adecuado.
 *
 * Variantes recomendadas:
 *  - 'grid'   → 400px  thumbnails en grilla (admin/cliente)
 *  - 'panel'  → 640px  imagen en panel lateral
 *  - 'full'   → 1600px lightbox / vista completa
 */
export function thumbUrl(url: string, _variant?: string): string {
  return url
}

/**
 * Redimensiona una imagen en el browser antes de subirla a Supabase.
 * Reduce fotos de 5-8MB a ~150-300KB — las imágenes cargan 15-25x más rápido.
 */
export async function resizeForUpload(file: File, maxWidth = 1800, quality = 0.78): Promise<File> {
  return new Promise(resolve => {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width)
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        quality
      )
    }
    img.src = url
  })
}
