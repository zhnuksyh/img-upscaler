/** Supported enlargement factors. 8x is achieved via a multi-pass 4x -> 2x pipeline. */
export type ScaleFactor = 2 | 4 | 8;

/** Lifecycle of a single image in the batch queue. */
export type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';

/** Accepted upload MIME types. */
export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/** Options passed to the remote Real-ESRGAN inference call. */
export interface UpscaleOptions {
  scale: ScaleFactor;
  /** Apply GFPGAN/CodeFormer face restoration for portraits. */
  faceRestore: boolean;
  /** Tile size in px for the GPU tiling pass (0 disables tiling). */
  tileSize: number;
  /** Tile overlap padding in px to avoid seam artifacts. */
  tilePad: number;
}

export const DEFAULT_OPTIONS: UpscaleOptions = {
  scale: 4,
  faceRestore: false,
  tileSize: 512,
  tilePad: 16,
};

/** A single image being processed through the batch queue. */
export interface UpscaleJob {
  id: string;
  file: File;
  /** Object URL for the original image preview (must be revoked on cleanup). */
  originalUrl: string;
  /** Object URL for the upscaled result once complete. */
  resultUrl?: string;
  /** The upscaled image as a Blob, used for downloads and zip export. */
  resultBlob?: Blob;
  status: JobStatus;
  /** 0–100 progress for the current job. */
  progress: number;
  /** Human-readable status text (queue position, ETA, error message). */
  message?: string;
  /** Options snapshot used for this job. */
  options: UpscaleOptions;
  /** Original image natural dimensions, filled on load. */
  width?: number;
  height?: number;
  /** Upscaled result natural dimensions, filled on completion. */
  resultWidth?: number;
  resultHeight?: number;
  /** Upscaled result byte size, filled on completion. */
  resultSize?: number;
  createdAt: number;
}

/** An entry in the in-browser session gallery of completed upscales. */
export interface GalleryItem {
  id: string;
  name: string;
  originalUrl: string;
  resultUrl: string;
  resultBlob: Blob;
  scale: ScaleFactor;
  createdAt: number;
}

/** Persisted endpoint configuration (localStorage). */
export interface EndpointConfig {
  /** Hugging Face Space id ("owner/space") or full URL. */
  spaceId: string;
  /** Optional HF user access token to consume personal ZeroGPU quota. */
  hfToken: string;
}

/** Default community Space used when the user has not configured their own. */
export const DEFAULT_ENDPOINT: EndpointConfig = {
  spaceId: 'zhnuksyh/img-upscaler-zerogpu',
  hfToken: '',
};

export const STORAGE_KEY = 'img-upscaler:endpoint-config';
