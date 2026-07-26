import { ACCEPTED_TYPES } from './types';

/** Generate a reasonably unique id without external deps. */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** True if the file is an accepted image type. */
export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(file.type);
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Label a resize factor for display: "4×" when enlarging, "50%" when shrinking
 * (a "0.5×" badge reads as a typo).
 */
export function formatScale(scale: number): string {
  return scale < 1 ? `${+(scale * 100).toFixed(0)}%` : `${scale}×`;
}

/** Read an image file's natural dimensions from an object URL. */
export function readImageSize(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not read image dimensions.'));
    img.src = url;
  });
}

/** Concatenate class names, skipping falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
