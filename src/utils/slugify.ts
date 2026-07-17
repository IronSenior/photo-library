/**
 * Slugify a free-text taxonomy value (país, lugar, clase, orden…) into a
 * URL-friendly, accent/case-insensitive key used for routing and grouping.
 * Keeping the human-readable text as the source of truth (rather than
 * forcing editors to type a slug in Keystatic) is what lets new content be
 * added without touching code.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}
