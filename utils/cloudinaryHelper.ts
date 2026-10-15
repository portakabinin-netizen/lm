/**
 * Safe Cloudinary URL Optimizer
 * ─────────────────────────────────────────────────────────────────────────────
 * Downscales avatar/marker images to lightweight thumbnails (e.g. 100x100),
 * dramatically speeding up custom map marker loading and eliminating UI delays.
 *
 * Handles:
 *  1. Unsigned Cloudinary URLs -> injects `/w_100,h_100,c_fill,q_auto,f_auto/`
 *  2. Signed Cloudinary URLs (`/s--...--/`) -> safely appends query params so
 *     the cryptographic signature is preserved.
 *  3. URLs with existing query strings -> safely appends with `&` instead of `?`.
 *  4. Fallback / Non-Cloudinary URLs -> safely appends query params without breakage.
 */

export interface CloudinaryTransformOptions {
  width?: number;
  height?: number;
  crop?: string;
  quality?: string;
  format?: string;
  gravity?: string;
}

/**
 * Optimizes an image URL for map marker display.
 * @param url The raw image URL
 * @param options Transformation parameters (default: 100x100 fill, auto quality)
 * @returns Optimized URL string
 */
export function optimizeCloudinaryUrl(
  url: string | null | undefined,
  options: CloudinaryTransformOptions = {}
): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';

  const {
    width = 100,
    height = 100,
    crop = 'fill',
    quality = 'auto',
    format = 'auto',
    gravity = 'face',
  } = options;

  // If it's a data URI or local file, return as-is
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const isCloudinary = trimmed.includes('res.cloudinary.com') && trimmed.includes('/image/upload/');
  if (!isCloudinary) {
    return trimmed;
  }

  const isSigned = /\/s--[^/]+--\//.test(trimmed);

  // 1. Unsigned Cloudinary URL: path-based transformation (recommended for CDN caching)
  if (!isSigned) {
    // Avoid double transformations if already transformed
    if (trimmed.includes(`/image/upload/w_${width}`) || trimmed.includes(`/image/upload/c_${crop}`)) {
      return trimmed;
    }

    const transform = `w_${width},h_${height},c_${crop},g_${gravity},q_${quality},f_${format}`;
    return trimmed.replace('/image/upload/', `/image/upload/${transform}/`);
  }

  // 2. Signed Cloudinary URL:
  // Use query parameter appending to avoid breaking digital signatures
  const transformParams = `w=${width}&h=${height}&c=${crop}&q=${quality}`;
  
  if (trimmed.includes('w=') && trimmed.includes('h=')) {
    return trimmed; // Query params already applied
  }

  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}${transformParams}`;
}

export default optimizeCloudinaryUrl;
