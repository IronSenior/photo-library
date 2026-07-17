import exifr from 'exifr';

export interface ExifSummary {
  camara?: string;
  objetivo?: string;
  exposicion?: string;
}

/**
 * Best-effort EXIF extraction, per project-definition.md §3.4: "Los
 * metadatos EXIF ... se extraen automáticamente en build si están
 * disponibles; el campo manual `equipo` es solo fallback."
 *
 * Only attempted for remote (R2) URLs, since that's the real production
 * pathway (exifr fetches the bytes over HTTP at build time). Local demo
 * assets never carry real EXIF data, so callers should fall back to the
 * manual `equipo` field for those.
 */
export async function getExifSummary(imagen: string): Promise<ExifSummary | null> {
  if (!/^https?:\/\//i.test(imagen)) {
    return null;
  }
  try {
    const data = await exifr.parse(imagen, ['Make', 'Model', 'LensModel', 'FNumber', 'ExposureTime', 'ISO']);
    if (!data) return null;

    const camara = [data.Make, data.Model].filter(Boolean).join(' ') || undefined;
    const objetivo = data.LensModel || undefined;

    const parts: string[] = [];
    if (data.FNumber) parts.push(`f/${data.FNumber}`);
    if (data.ExposureTime) parts.push(`${formatShutterSpeed(data.ExposureTime)}s`);
    if (data.ISO) parts.push(`ISO ${data.ISO}`);
    const exposicion = parts.length ? parts.join(' · ') : undefined;

    if (!camara && !objetivo && !exposicion) return null;
    return { camara, objetivo, exposicion };
  } catch {
    return null;
  }
}

function formatShutterSpeed(seconds: number): string {
  if (seconds >= 1) return seconds.toString();
  return `1/${Math.round(1 / seconds)}`;
}
