// Resolves the `imagen` field stored on photo entries into something Astro's
// <Image /> component can optimize.
//
//  - full http(s) URL  -> returned as-is. Must be allow-listed via
//    `image.domains` in astro.config.mjs (this is how the real R2-hosted
//    originals get optimized in production, with no download step).
//  - relative path      -> resolved against the locally imported demo assets
//    in src/assets/photos/ (used by the seed content in this repo).
//  - unresolvable path  -> returned as-is; <Image> will render it unoptimized
//    (e.g. useful for a path under public/ during local experimentation).
const localPhotoModules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

const localPhotosByPath = new Map<string, ImageMetadata>();
for (const [modulePath, mod] of Object.entries(localPhotoModules)) {
  const key = modulePath.replace('/src/assets/photos/', '');
  localPhotosByPath.set(key, mod.default);
}

export type PhotoSource = ImageMetadata | string;

export function resolvePhotoSrc(imagen: string): PhotoSource {
  if (/^https?:\/\//i.test(imagen)) {
    return imagen;
  }
  const key = imagen.replace(/^\/+/, '');
  return localPhotosByPath.get(key) ?? imagen;
}

export function isRemotePhoto(src: PhotoSource): src is string {
  return typeof src === 'string';
}

// Used as <Image width/height> when `imagen` is a remote URL and the entry
// didn't provide explicit `ancho`/`alto` (Astro can't infer dimensions of a
// remote asset without fetching it first).
export const FALLBACK_WIDTH = 1600;
export const FALLBACK_HEIGHT = 1067;

/**
 * Renders an optimized rendition of a photo and returns its final URL, for
 * use in `<meta property="og:image">` tags (which need a plain URL string,
 * not an <Image /> component).
 */
export async function getOgImageUrl(imagen: string, ancho?: number, alto?: number): Promise<string> {
  const { getImage } = await import('astro:assets');
  const src = resolvePhotoSrc(imagen);
  const remote = isRemotePhoto(src);
  const image = remote
    ? await getImage({ src, width: ancho ?? FALLBACK_WIDTH, height: alto ?? FALLBACK_HEIGHT })
    : await getImage({ src, width: Math.min(src.width, 1200) });
  return image.src;
}
