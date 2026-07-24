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
  const client = await getClient(config);

  let resultData: unknown[] | undefined;
  try {
    // Subscribe to queue status so the UI can reflect position/progress.
    const submission = client.submit('/upscale', [
      file,
      options.scale,
      options.faceRestore,
      options.tileSize,
      options.tilePad,
    ]);

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
