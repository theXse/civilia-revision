// Regiones de la plataforma. El orden define cómo se muestran en el dashboard
// y en el export. Los nombres deben coincidir exactamente con regions.name
// en Supabase y con projects.region.
export const REGIONS = [
  'Osorno',
  'Santiago',
  'Valdivia',
  'Concepción',
  'Carruseles Generales Civilia',
] as const

export type RegionName = (typeof REGIONS)[number]
