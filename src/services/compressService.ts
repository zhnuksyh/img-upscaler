/**
 * Client-side "compress to a target file size" for an already-upscaled result.
 *
 * All AI inference is remote, but the browser already holds the result Blob, so
 * we can re-encode it locally to land at or under a byte budget (e.g. 500 KiB)
 * with no backend round-trip. Strategy:
 *   1. Binary-search the encoder quality (JPEG/WebP) at full resolution.
 *   2. If even the lowest quality is still too big, progressively downscale the
 *      dimensions and repeat, so we always converge on something ≤ target.
 * PNG is lossless with no quality knob, so target-size output uses JPEG/WebP.
 */

/** Encoders that support a quality parameter for target-size compression. */
export type CompressFormat = 'image/jpeg' | 'image/webp';

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  /** Encoder quality actually used (0–1). */
  quality: number;
}

/** Decode a Blob into an ImageBitmap (falls back to <img> where unsupported). */
export async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to <img> path */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image for compression.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draw `source` into a fresh canvas at the given size. Accepts a canvas as the
 * source too, so callers can resample in repeated steps.
 */
export function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function encode(
  canvas: HTMLCanvasElement,
  format: CompressFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed.'))),
      format,
      quality,
    );
  });
}

/** Source dimensions of a decoded image/bitmap. */
export function dims(source: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  const w = 'width' in source && typeof source.width === 'number' ? source.width : 0;
  const h = 'height' in source && typeof source.height === 'number' ? source.height : 0;
  return {
    w: (source as HTMLImageElement).naturalWidth || w,
    h: (source as HTMLImageElement).naturalHeight || h,
  };
}

/**
 * Re-encode `blob` to fit within `targetBytes`, returning the largest/best
 * result that still fits. Throws if the target cannot be met even at minimum
 * quality and a heavily downscaled size (extremely small budgets).
 */
export async function compressToTargetSize(
  blob: Blob,
  targetBytes: number,
  format: CompressFormat = 'image/jpeg',
): Promise<CompressResult> {
  if (targetBytes <= 0) throw new Error('Target size must be greater than 0.');

  const source = await decode(blob);
  const { w: baseW, h: baseH } = dims(source);
  if (!baseW || !baseH) throw new Error('Could not read source dimensions.');

  // Downscale factors to try, from full-res down. Only shrink dimensions if
  // quality alone can't reach the budget.
  const scales = [1, 0.85, 0.7, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1];

  let best: CompressResult | null = null;

  for (const scale of scales) {
    const canvas = drawToCanvas(source, baseW * scale, baseH * scale);

    // Binary-search quality for this resolution.
    let lo = 0.2;
    let hi = 0.95;
    let fitAtThisScale: CompressResult | null = null;

    for (let iter = 0; iter < 7; iter++) {
      const q = (lo + hi) / 2;
      const out = await encode(canvas, format, q);
      if (out.size <= targetBytes) {
        fitAtThisScale = {
          blob: out,
          width: canvas.width,
          height: canvas.height,
          quality: q,
        };
        lo = q; // room to raise quality
      } else {
        hi = q; // must lower quality
      }
    }

    if (fitAtThisScale) {
      // Full-res (or the largest scale) that fits wins — take it and stop.
      best = fitAtThisScale;
      break;
    }

    // Even min quality at this scale overshot; try a smaller size.
    const floor = await encode(canvas, format, 0.2);
    if (floor.size <= targetBytes) {
      best = { blob: floor, width: canvas.width, height: canvas.height, quality: 0.2 };
      break;
    }
  }

  if ('close' in source && typeof source.close === 'function') source.close();

  if (!best) {
    throw new Error(
      'Target size is too small for this image — try a larger budget.',
    );
  }
  return best;
}
