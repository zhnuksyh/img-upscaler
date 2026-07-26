/**
 * Client-side resampling for the cases that need no AI inference.
 *
 * Two jobs live here, and both deliberately avoid the GPU:
 *
 *   1. Downscaling (factors < 1). Shrinking an image invents no detail, so
 *      there is nothing for Real-ESRGAN to contribute — a canvas resample is
 *      identical in result, instant, and costs no Modal credits.
 *   2. "Fit to a target file size" above the source size. Growing a file means
 *      genuinely adding pixels, which does need the model, but only once: we
 *      take a single 4x result and search locally over sizes to land nearest
 *      the byte budget, rather than probing the GPU per candidate factor.
 */

import { decode, dims, drawToCanvas } from './compressService';

/** Output encoders. PNG is lossless (no quality knob); the others are lossy. */
export type ResizeFormat = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
}

function encode(
  canvas: HTMLCanvasElement,
  format: ResizeFormat,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed.'))),
      format,
      quality,
    );
  });
}

/**
 * Resample `source` to an exact pixel size, halving in steps when shrinking a
 * lot. A single `drawImage` to a much smaller size only point-samples on some
 * browsers and aliases badly; repeated halving averages neighbouring pixels
 * and keeps fine texture readable.
 */
function resampleTo(
  source: ImageBitmap | HTMLImageElement,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  const { w: srcW, h: srcH } = dims(source);
  let canvas = drawToCanvas(source, srcW, srcH);

  // Halve until one more halving would undershoot the target.
  let w = srcW;
  let h = srcH;
  while (w / 2 >= targetW && h / 2 >= targetH && w > 2 && h > 2) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    canvas = drawToCanvas(canvas, w, h);
  }

  // Final non-integer step to the exact requested size.
  if (w !== targetW || h !== targetH) {
    canvas = drawToCanvas(canvas, targetW, targetH);
  }
  return canvas;
}

/**
 * Scale `blob` by an arbitrary factor entirely in the browser. Used for the
 * downscale factors, which need no model pass.
 */
export async function resizeByFactor(
  blob: Blob,
  factor: number,
  format: ResizeFormat = 'image/png',
): Promise<ResizeResult> {
  if (factor <= 0) throw new Error('Scale factor must be greater than 0.');

  const source = await decode(blob);
  const { w, h } = dims(source);
  if (!w || !h) throw new Error('Could not read source dimensions.');

  const targetW = Math.max(1, Math.round(w * factor));
  const targetH = Math.max(1, Math.round(h * factor));
  const canvas = resampleTo(source, targetW, targetH);
  const out = await encode(canvas, format, format === 'image/png' ? undefined : 0.92);

  if ('close' in source && typeof source.close === 'function') source.close();
  return { blob: out, width: canvas.width, height: canvas.height };
}

export interface FitToSizeResult extends ResizeResult {
  /** Fraction of the upscaled source kept, for reporting (1 = full 4x size). */
  factor: number;
  /** True when the budget could not be reached and this is the closest fit. */
  approximate: boolean;
}

/**
 * Find the largest rendition of `blob` whose encoded size lands at or under
 * `targetBytes`, by searching over dimensions rather than encoder quality.
 *
 * This is the "grow a 120 KB source to ~1.2 MB" path: the caller has already
 * paid for one 4x GPU pass, and we binary-search that result's scale locally.
 * Quality is held high and fixed so the byte budget buys pixels, not artifacts
 * — the opposite trade from `compressToTargetSize`, which holds size and moves
 * quality to squeeze *under* a small budget.
 */
export async function fitToTargetSize(
  blob: Blob,
  targetBytes: number,
  format: ResizeFormat = 'image/jpeg',
  quality = 0.92,
): Promise<FitToSizeResult> {
  if (targetBytes <= 0) throw new Error('Target size must be greater than 0.');

  const source = await decode(blob);
  const { w: baseW, h: baseH } = dims(source);
  if (!baseW || !baseH) throw new Error('Could not read source dimensions.');

  const encodeAt = async (factor: number) => {
    const canvas = resampleTo(
      source,
      Math.max(1, Math.round(baseW * factor)),
      Math.max(1, Math.round(baseH * factor)),
    );
    const out = await encode(canvas, format, format === 'image/png' ? undefined : quality);
    return { blob: out, width: canvas.width, height: canvas.height, factor };
  };

  try {
    let best = await encodeAt(1);

    // Bracket the answer first. If full size already fits, the budget is meant
    // to buy *more* pixels, so grow until we overshoot — capping the search at
    // 1x would silently hand back a file far under the requested size. If it
    // doesn't fit, 1x is the upper bound and we shrink from there.
    let lo: number;
    let hi: number;

    if (best.blob.size <= targetBytes) {
      lo = 1;
      hi = 1;
      // Enlarging past ~4x the already-upscaled result stops being meaningful,
      // and each step costs memory quadratically, so stop there.
      while (hi < 4) {
        const grown = await encodeAt(Math.min(4, hi * 1.5));
        if (grown.blob.size <= targetBytes) {
          best = grown;
          lo = grown.factor;
          if (grown.factor >= 4) break;
          hi = grown.factor;
        } else {
          hi = grown.factor;
          break;
        }
      }
      // Never overshot within the cap — this is as close as we can get.
      if (lo === hi) return { ...best, approximate: lo >= 4 };
    } else {
      lo = 0.05;
      hi = 1;
    }

    // Narrow the bracket. Encoded size grows roughly with pixel count, so this
    // converges quickly and monotonically enough for our purposes.
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const candidate = await encodeAt(mid);
      if (candidate.blob.size <= targetBytes) {
        best = candidate; // fits — try bigger
        lo = mid;
      } else {
        hi = mid; // too big — shrink
      }
    }

    // `best` still holds the 1x probe if nothing smaller ever fit.
    return { ...best, approximate: best.blob.size > targetBytes };
  } finally {
    if ('close' in source && typeof source.close === 'function') source.close();
  }
}
