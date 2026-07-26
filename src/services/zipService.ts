import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { UpscaleJob } from '../types';

/**
 * Filename-safe tag for a resize factor: "4x" enlarging, "50pct" shrinking.
 * Avoids "0.5x", whose dot muddles the extension.
 */
export function scaleTag(scale: number): string {
  return scale < 1 ? `${+(scale * 100).toFixed(0)}pct` : `${scale}x`;
}

/** Derive an output filename like "photo_4x.png" from a source file name. */
export function upscaledFileName(
  originalName: string,
  scale: number,
  blob?: Blob,
): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const ext = extForBlob(blob);
  return `${base}_${scaleTag(scale)}.${ext}`;
}

function extForBlob(blob?: Blob): string {
  switch (blob?.type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

/** Download a single completed job's result. */
export function downloadJob(job: UpscaleJob): void {
  if (!job.resultBlob) return;
  saveAs(job.resultBlob, jobFileName(job));
}

/**
 * Output name for a job. A file-size-budget job has no meaningful factor, so it
 * is tagged with the budget it was aiming for ("photo_500kb.jpg").
 */
export function jobFileName(job: UpscaleJob): string {
  if (job.options.scale < 1 && job.options.shrinkMode === 'filesize') {
    const dot = job.file.name.lastIndexOf('.');
    const base = dot > 0 ? job.file.name.slice(0, dot) : job.file.name;
    const kb = Math.round(job.options.targetBytes / 1024);
    const tag = kb >= 1024 ? `${+(kb / 1024).toFixed(1)}mb` : `${kb}kb`;
    return `${base}_${tag}.${extForBlob(job.resultBlob)}`;
  }
  return upscaledFileName(job.file.name, job.options.scale, job.resultBlob);
}

/**
 * Bundle every completed job into a single .zip and trigger a download.
 * De-duplicates colliding filenames by appending an index.
 */
export async function downloadBatchZip(
  jobs: UpscaleJob[],
  zipName = 'upscaled-images.zip',
): Promise<void> {
  const completed = jobs.filter((j) => j.status === 'done' && j.resultBlob);
  if (completed.length === 0) return;

  const zip = new JSZip();
  const used = new Set<string>();

  for (const job of completed) {
    let name = jobFileName(job);
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      const base = name.slice(0, dot);
      const ext = name.slice(dot);
      let i = 2;
      while (used.has(`${base}-${i}${ext}`)) i++;
      name = `${base}-${i}${ext}`;
    }
    used.add(name);
    zip.file(name, job.resultBlob!);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    // Images are already compressed; keep zip fast with a light level.
    compressionOptions: { level: 1 },
  });
  saveAs(blob, zipName);
}
