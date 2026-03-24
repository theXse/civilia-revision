/**
 * Convierte una URL de Supabase Storage a una URL de thumbnail.
 * Usa el endpoint render/image de Supabase para servir imágenes redimensionadas.
 */
export function thumbUrl(url: string, width = 800, quality = 75): string {
  if (!url.includes('/storage/v1/object/public/')) return url
  return (
    url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') +
    `?width=${width}&quality=${quality}`
  )
}

/**
 * Redimensiona una imagen en el browser antes de subirla a Supabase.
 * Reduce fotos de 5-8MB a ~200-400KB — las imágenes cargan 10-20x más rápido.
 */
export async function resizeForUpload(file: File, maxWidth = 1920, quality = 0.82): Promise<File> {
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
