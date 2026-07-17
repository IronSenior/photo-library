import { getCollection, type CollectionEntry } from 'astro:content';

export type AnyPhotoEntry =
  | { categoria: 'fauna'; entry: CollectionEntry<'faunaPhotos'> }
  | { categoria: 'viaje'; entry: CollectionEntry<'travelPhotos'> }
  | { categoria: 'evento'; entry: CollectionEntry<'eventPhotos'> };

/**
 * A photo `id` is unique across the whole site (enforced by convention, not
 * by the CMS), so `/foto/[id]` needs to search all three photo collections.
 * Loads each collection once and searches by id, rather than probing with
 * `getEntry()` per collection (which logs a noisy "not found" warning for
 * every miss).
 */
export async function getPhotoById(id: string): Promise<AnyPhotoEntry | null> {
  const [fauna, viajes, eventos] = await Promise.all([
    getCollection('faunaPhotos'),
    getCollection('travelPhotos'),
    getCollection('eventPhotos'),
  ]);

  const faunaMatch = fauna.find((p) => p.id === id);
  if (faunaMatch) return { categoria: 'fauna', entry: faunaMatch };

  const viajeMatch = viajes.find((p) => p.id === id);
  if (viajeMatch) return { categoria: 'viaje', entry: viajeMatch };

  const eventoMatch = eventos.find((p) => p.id === id);
  if (eventoMatch) return { categoria: 'evento', entry: eventoMatch };

  return null;
}
