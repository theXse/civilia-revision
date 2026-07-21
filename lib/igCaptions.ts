/**
 * Copys de Instagram por proyecto.
 * El mockup busca el proyecto cuyo nombre contenga alguno de los alias
 * de `match` (sin distinguir mayúsculas) y usa su copy y su ubicación
 * etiquetada. Para agregar o cambiar un copy, pásaselo a Claude en el
 * chat y él actualiza este archivo.
 */

type IgPost = {
  match: string[]
  /** Ubicación etiquetada del post (línea bajo el usuario). Como en
   *  Instagram real: un lugar, no el nombre del proyecto. */
  location?: string
  caption: string
}

const CAPTIONS: IgPost[] = [
  {
    // JDN — proyecto "JARDIN DEL NORTE" en Santiago
    match: ['jdn', 'jardin', 'jardín'],
    location: 'Huechuraba',
    caption: `Vivir bien no es un lujo, es una decisión. 🏡
Departamentos nuevos de 3D y 2B desde UF 4.534, con piscina, gimnasio, cancha de pádel, cowork y más.
📍 Av. Santa Marta de Huechuraba 6650
Cotiza hoy`,
  },
]

export function igPostFor(projectName: string | undefined): { caption: string; location?: string } {
  if (!projectName) return { caption: '' }
  const name = projectName.toLowerCase()
  const found = CAPTIONS.find(c => c.match.some(m => name.includes(m)))
  return found ? { caption: found.caption, location: found.location } : { caption: '' }
}
