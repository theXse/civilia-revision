/**
 * Copys de Instagram por proyecto.
 * El mockup busca el proyecto cuyo nombre contenga `match` (sin
 * distinguir mayúsculas) y usa su copy. Para agregar o cambiar un copy,
 * pásaselo a Claude en el chat y él actualiza este archivo.
 */

const CAPTIONS: { match: string[]; caption: string }[] = [
  {
    // JDN — proyecto "JARDIN..." en Santiago (Av. Santa Marta de Huechuraba)
    match: ['jdn', 'jardin', 'jardín'],
    caption: `Vivir bien no es un lujo, es una decisión. 🏡
Departamentos nuevos de 3D y 2B desde UF 4.534, con piscina, gimnasio, cancha de pádel, cowork y más.
📍 Av. Santa Marta de Huechuraba 6650
Cotiza hoy`,
  },
]

export function igCaptionFor(projectName: string | undefined): string {
  if (!projectName) return ''
  const name = projectName.toLowerCase()
  return CAPTIONS.find(c => c.match.some(m => name.includes(m)))?.caption || ''
}
