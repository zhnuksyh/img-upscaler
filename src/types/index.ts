/**
 * Supported resize factors. The backend runs a single 4x Real-ESRGAN pass and
 * resamples to the requested factor, so 2x/4x/8x all come from that one model.
 *
 * Factors below 1 are downscales: pure resampling with no new detail to infer,
 * so those never touch the GPU and are done in the browser instead.
 */
export type ScaleFactor = 0.25 | 0.5 | 0.75 | 2 | 4 | 8;

/** Whether a factor needs remote inference or is a local-only resample. */
export function isDownscale(scale: ScaleFactor): boolean {
  return scale < 1;
}

/** Lifecycle of a single image in the batch queue. */
export type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'cancelled';

/** Accepted upload MIME types. */
export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/**
 * How a "shrink" job decides its output size.
 * - `factor`: a percentage of the original dimensions.
 * - `filesize`: hit a byte budget, letting the dimensions fall where they may.
 */
export type ShrinkMode = 'factor' | 'filesize';

/** Options passed to the remote Real-ESRGAN inference call. */
export interface UpscaleOptions {
  scale: ScaleFactor;
  /** Which shrink strategy applies when `scale` is a downscale. */
  shrinkMode: ShrinkMode;
  /** Target output size in bytes, used when `shrinkMode` is 'filesize'. */
  targetBytes: number;
  /** Apply GFPGAN/CodeFormer face restoration for portraits. */
  faceRestore: boolean;
  /** Tile size in px for the GPU tiling pass (0 disables tiling). */
  tileSize: number;
  /** Tile overlap padding in px to avoid seam artifacts. */
  tilePad: number;
}

export const DEFAULT_OPTIONS: UpscaleOptions = {
  scale: 4,
  shrinkMode: 'factor',
  targetBytes: 500 * 1024,
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
  /** What the job targeted, so a byte-budget entry isn't badged as a factor. */
  shrinkMode?: ShrinkMode;
  targetBytes?: number;
  createdAt: number;
}

/**
 * Which API contract the backend exposes.
 * - `modal`: a Modal serverless-GPU web endpoint (this repo's `modal_app.py`).
 *   Plain JSON `fetch` POST; the endpoint owner controls CORS, so browsers can
 *   call it directly. This is the recommended $0/month, no-subscription path.
 * - `custom`: the `hf_space/app.py` Gradio backend — endpoint `/upscale`,
 *   args `[image, scale, faceRestore, tileSize, tilePad]` (requires a hosted
 *   HF Space, which now needs a PRO plan to create).
 * - `community`: a public Gradio Space — endpoint `/predict`,
 *   args `[image, "2x"|"4x"|"8x"]`. NOTE: browsers are blocked from calling
 *   third-party public Spaces by CORS (the Gradio client sends credentialed
 *   requests the Space does not allow), so this generally only works when the
 *   Space is same-origin or CORS-permissive. Kept for completeness.
 */
export type EndpointApi = 'modal' | 'custom' | 'community';

/** Persisted endpoint configuration (localStorage). */
export interface EndpointConfig {
  /**
   * The backend identifier:
   * - `modal`  → full endpoint URL (e.g. https://you--img-upscaler-upscale.modal.run)
   * - `custom`/`community` → HF Space id ("owner/space") or *.hf.space URL
   */
  spaceId: string;
  /** Optional HF user access token (Gradio backends only). */
  hfToken: string;
  /** API contract of the target backend. */
  api: EndpointApi;
}

/**
 * Default backend. Empty by default — the user must deploy their own Modal
 * endpoint (see README) and paste its URL in Settings. We ship no shared
 * default endpoint because there is no reliable free public one that browsers
 * can reach (HF public Spaces are CORS-blocked; hosting a Space needs PRO).
 */
export const DEFAULT_ENDPOINT: EndpointConfig = {
  spaceId: '',
  hfToken: '',
  api: 'modal',
};

export const STORAGE_KEY = 'img-upscaler:endpoint-config';
