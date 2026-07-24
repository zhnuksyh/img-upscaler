import {
  DEFAULT_ENDPOINT,
  STORAGE_KEY,
  type EndpointApi,
  type EndpointConfig,
} from '../types';

/** Coerce an arbitrary stored value into a valid EndpointApi. */
function normalizeApi(value: unknown): EndpointApi {
  return value === 'custom' || value === 'community' ? value : 'modal';
}

/** Read the persisted endpoint config, falling back to the community default. */
export function loadConfig(): EndpointConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ENDPOINT };
    const parsed = JSON.parse(raw) as Partial<EndpointConfig>;
    return {
      spaceId: parsed.spaceId?.trim() || DEFAULT_ENDPOINT.spaceId,
      hfToken: parsed.hfToken?.trim() || '',
      api: normalizeApi(parsed.api),
    };
  } catch {
    return { ...DEFAULT_ENDPOINT };
  }
}

/** Persist endpoint config to localStorage. */
export function saveConfig(config: EndpointConfig): void {
  const clean: EndpointConfig = {
    spaceId: config.spaceId.trim() || DEFAULT_ENDPOINT.spaceId,
    hfToken: config.hfToken.trim(),
    api: normalizeApi(config.api),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
}

/** True once the user has entered a backend endpoint (URL or Space id). */
export function isEndpointConfigured(config: EndpointConfig): boolean {
  return config.spaceId.trim().length > 0;
}

/**
 * Normalize a user-entered Space identifier into what @gradio/client accepts.
 * Accepts "owner/space", "https://owner-space.hf.space", or a full
 * "https://huggingface.co/spaces/owner/space" URL.
 */
export function normalizeSpaceId(input: string): string {
  const value = input.trim().replace(/\/+$/, '');
  if (!value) return DEFAULT_ENDPOINT.spaceId;

  // Full huggingface.co spaces URL -> owner/space
  const hfMatch = value.match(
    /huggingface\.co\/spaces\/([^/]+\/[^/?#]+)/i,
  );
  if (hfMatch) return hfMatch[1];

  // Direct *.hf.space subdomain — pass through as a full URL, @gradio/client
  // resolves these directly.
  if (/\.hf\.space/i.test(value)) return value;

  // Otherwise assume it is already "owner/space".
  return value;
}
