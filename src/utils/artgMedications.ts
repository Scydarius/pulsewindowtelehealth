import artgData from '../data/artg-medications.json';

export type ArtgMedication = {
  id: string;
  name: string;
  brand: string;
  generic: string;
  strength: string;
  form: string;
  pbs: boolean;
  defaultDose: string;
  defaultFrequency: string;
  defaultDirections: string;
  defaultRepeats: number;
};

export const ARTG_MEDICATIONS: ArtgMedication[] = artgData as ArtgMedication[];

/** Search Australian Register of Therapeutic Goods prescribable medicines */
export function searchArtgMedications(query: string, limit = 15): ArtgMedication[] {
  const q = query.trim().toLowerCase();
  if (!q) return ARTG_MEDICATIONS.slice(0, limit);

  const tokens = q.split(/\s+/).filter(Boolean);

  const results = ARTG_MEDICATIONS.filter((med) => {
    const haystack = `${med.brand} ${med.generic} ${med.name} ${med.strength} ${med.form}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  // Rank exact brand or generic prefix matches first
  results.sort((a, b) => {
    const aBrandMatch = a.brand.toLowerCase().startsWith(q);
    const bBrandMatch = b.brand.toLowerCase().startsWith(q);
    if (aBrandMatch && !bBrandMatch) return -1;
    if (!aBrandMatch && bBrandMatch) return 1;

    const aGenericMatch = a.generic.toLowerCase().startsWith(q);
    const bGenericMatch = b.generic.toLowerCase().startsWith(q);
    if (aGenericMatch && !bGenericMatch) return -1;
    if (!aGenericMatch && bGenericMatch) return 1;

    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit);
}
