import { Client } from '@gradio/client';
import type { EndpointConfig, UpscaleOptions } from '../types';
import { normalizeSpaceId } from './config';

/**
 * Remote upscaling service.
 *
 * All heavy inference runs on the Hugging Face ZeroGPU Space — the browser only
 * uploads the source image and receives the result blob. Nothing is computed
 * locally. A Gradio {@link Client} is connected per endpoint config and cached
 * so batch jobs reuse a single websocket session.
 */

export class UpscaleError extends Error {
  /** True when the failure is a GPU quota / rate-limit (HTTP 429) exhaustion. */
  readonly quota: boolean;
  constructor(message: string, opts: { cause?: unknown; quota?: boolean } = {}) {
    super(message);
    this.name = 'UpscaleError';
    this.cause = opts.cause;
    this.quota = opts.quota ?? false;
  }
  readonly cause?: unknown;
}

/**
 * Detect a ZeroGPU quota / rate-limit signal from an error or status message.
 * Gradio wraps the underlying HTTP response, so we match on the surfaced text
 * (status code 429, "quota", "gpu", "exceeded", "rate limit", …).
 */
function isQuotaSignal(input: unknown): boolean {
  const text = (
    typeof input === 'string'
      ? input
      : input instanceof Error
        ? `${input.message}`
        : ''
  ).toLowerCase();
  if (!text) return false;
  return (
    text.includes('429') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('rate-limit') ||
    text.includes('too many requests') ||
    text.includes('exceeded your gpu') ||
    (text.includes('gpu') && text.includes('exceeded'))
  );
}

const GUEST_QUOTA_MESSAGE =
  'Daily free GPU limit reached for your connection. Try again tomorrow, or add your Hugging Face token in Settings for a higher limit.';

let cached: { key: string; client: Promise<Client> } | null = null;

function endpointKey(config: EndpointConfig): string {
  return `${normalizeSpaceId(config.spaceId)}::${config.hfToken ? 'tok' : 'anon'}`;
}

/** Connect to (or reuse) the Gradio client for the given endpoint config. */
async function getClient(config: EndpointConfig): Promise<Client> {
  const key = endpointKey(config);
  if (cached?.key === key) return cached.client;

  const target = normalizeSpaceId(config.spaceId);
  const options = config.hfToken
    ? { hf_token: config.hfToken as `hf_${string}` }
    : {};

  const client = Client.connect(target, options).catch((err) => {
    cached = null; // allow retry on next call
    throw new UpscaleError(
      `Could not connect to Space "${target}". Check the Space id/URL and that it is running.`,
      { cause: err },
    );
  });

  cached = { key, client };
  return client;
}

/** Drop the cached connection (call after the user changes endpoint config). */
export function resetClient(): void {
  cached = null;
}

/**
 * Upscale a single image on the remote GPU.
 *
 * @param file    Source image file.
 * @param options Scale factor, face-restore toggle, and tiling parameters.
 * @param config  Endpoint (Space id + optional HF token).
 * @param onStatus Optional callback for coarse status text (queue/processing).
 * @returns The upscaled image as a PNG-ish Blob.
 */
export async function upscaleImage(
  file: File,
  options: UpscaleOptions,
  config: EndpointConfig,
  onStatus?: (text: string) => void,
): Promise<Blob> {
  // Modal endpoint: plain JSON fetch, no Gradio client (avoids the CORS issue
  // entirely because the Modal endpoint sets its own CORS headers).
  if (config.api === 'modal') {
    return upscaleViaModal(file, options, config, onStatus);
  }

  const client = await getClient(config);

  // Build the request for the target Space's API contract.
  let endpoint: string;
  let args: unknown[];
  if (config.api === 'community') {
    // Public Face-Real-ESRGAN: /predict(image, "2x"|"4x"|"8x").
    endpoint = '/predict';
    args = [file, `${options.scale}x`];
  } else {
    // Our own hf_space/app.py: /upscale(image, scale, face, tile, pad).
    endpoint = '/upscale';
    args = [
      file,
      options.scale,
      options.faceRestore,
      options.tileSize,
      options.tilePad,
    ];
  }

  let resultData: unknown[] | undefined;
  try {
    // Subscribe to queue status so the UI can reflect position/progress.
    const submission = client.submit(endpoint, args);

    for await (const msg of submission) {
      if (msg.type === 'status') {
        if (msg.stage === 'error') {
          const detail = statusMessage(msg.message);
          if (isQuotaSignal(detail)) {
            throw new UpscaleError(GUEST_QUOTA_MESSAGE, { quota: true });
          }
          throw new UpscaleError(detail);
        }
        if (onStatus) {
          if (msg.stage === 'pending') {
            onStatus(
              typeof msg.position === 'number' && msg.position > 0
                ? `Queued (#${msg.position + 1})…`
                : 'Queued…',
            );
          } else if (msg.stage === 'generating') {
            onStatus('Upscaling on GPU…');
          }
        }
      } else if (msg.type === 'data') {
        resultData = msg.data;
      }
    }
  } catch (err) {
    if (err instanceof UpscaleError) throw err;
    if (isQuotaSignal(err)) {
      throw new UpscaleError(GUEST_QUOTA_MESSAGE, { cause: err, quota: true });
    }
    throw new UpscaleError(
      'Upscaling failed. The Space may be starting or temporarily unavailable.',
      { cause: err },
    );
  }

  const blob = await extractBlob(resultData);
  if (!blob) {
    throw new UpscaleError('The Space returned no image data.');
  }
  return blob;
}

/**
 * Upscale via a Modal serverless-GPU web endpoint.
 *
 * Sends the image as base64 JSON and receives base64 PNG back. The Modal
 * endpoint owns its CORS headers, so this works cross-origin from GitHub Pages
 * without the credentialed-request problem the Gradio browser client has.
 * Cold starts (container boot + model load) can take 20–60s; the status
 * callback surfaces that as "warming up".
 */
async function upscaleViaModal(
  file: File,
  options: UpscaleOptions,
  config: EndpointConfig,
  onStatus?: (text: string) => void,
): Promise<Blob> {
  const url = config.spaceId.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new UpscaleError(
      'No Modal endpoint URL configured. Deploy modal_app.py and paste its URL in Settings.',
    );
  }

  onStatus?.('Warming up GPU…');
  const dataUrl = await fileToBase64(file);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        scale: options.scale,
        faceRestore: options.faceRestore,
        tileSize: options.tileSize,
        tilePad: options.tilePad,
      }),
    });
  } catch (err) {
    throw new UpscaleError(
      'Could not reach the Modal endpoint. Check the URL and that it is deployed.',
      { cause: err },
    );
  }

  if (!res.ok) {
    let detail = `Modal endpoint returned HTTP ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 429 || isQuotaSignal(detail)) {
      throw new UpscaleError(GUEST_QUOTA_MESSAGE, { quota: true });
    }
    throw new UpscaleError(detail);
  }

  onStatus?.('Upscaling on GPU…');
  const json = (await res.json()) as { image?: string; error?: string };
  if (json.error) throw new UpscaleError(json.error);
  if (!json.image) throw new UpscaleError('The Modal endpoint returned no image.');

  return base64ToBlob(json.image, 'image/png');
}

/** Read a File as a base64 data URL. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.readAsDataURL(file);
  });
}

/** Decode a base64 (optionally data-URL) string into a Blob. */
function base64ToBlob(b64: string, type: string): Blob {
  const clean = b64.includes(',') ? b64.split(',', 2)[1] : b64;
  const bytes = atob(clean);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

/** Gradio status.message may be a string or a list of validation errors. */
function statusMessage(
  message: string | { message: string }[] | undefined,
): string {
  if (!message) return 'The Space reported an error.';
  if (typeof message === 'string') return message;
  return message.map((m) => m.message).join('; ') || 'The Space reported an error.';
}

/**
 * The Gradio image output can arrive as a { url, path } descriptor or a Blob.
 * Resolve it into a real Blob we can preview, download, and zip.
 */
async function extractBlob(data: unknown[] | undefined): Promise<Blob | null> {
  const payload = data?.[0];
  if (!payload) return null;

  if (payload instanceof Blob) return payload;

  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as { url?: string; path?: string; blob?: Blob };
    if (obj.blob instanceof Blob) return obj.blob;
    if (obj.url) {
      const res = await fetch(obj.url);
      if (!res.ok) throw new UpscaleError('Failed to download the result image.');
      return res.blob();
    }
  }

  if (typeof payload === 'string' && /^https?:/.test(payload)) {
    const res = await fetch(payload);
    if (!res.ok) throw new UpscaleError('Failed to download the result image.');
    return res.blob();
  }

  return null;
}
