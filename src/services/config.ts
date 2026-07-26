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

/** Verdict on a Modal endpoint URL's shape, before any network call. */
export interface EndpointCheck {
  level: 'ok' | 'warn' | 'error';
  message: string;
  /** A corrected URL to offer the user, when the mistake is recognisable. */
  suggestion?: string;
}

/**
 * Sanity-check a Modal endpoint URL by shape alone.
 *
 * The common failure is pasting the Modal *dashboard* page
 * (modal.com/apps/<user>/main/deployed/<app>) instead of the deployed web
 * endpoint (<user>--<app>-<fn>.modal.run) — the dashboard is the page you are
 * looking at when you go to copy the URL, and a POST to it can never return an
 * image. That mistake is recognisable enough to reconstruct the right URL.
 */
export function checkModalUrl(input: string): EndpointCheck | null {
  const value = input.trim().replace(/\/+$/, '');
  if (!value) return null; // nothing entered yet — say nothing

  if (!/^https?:\/\//i.test(value)) {
    return { level: 'error', message: 'Must be a full URL starting with https://' };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { level: 'error', message: "That doesn't parse as a URL." };
  }

  // The dashboard-URL mistake. Path is /apps/<workspace>/<env>/deployed/<app>.
  const dash = url.pathname.match(/^\/apps\/([^/]+)\/[^/]+\/deployed\/([^/?#]+)/i);
  if (/(^|\.)modal\.com$/i.test(url.hostname)) {
    if (dash) {
      const [, workspace, appName] = dash;
      return {
        level: 'error',
        message: 'This is the Modal dashboard page, not the deployed endpoint.',
        // modal_app.py names the function `upscale`, so the web endpoint is
        // <workspace>--<app>-upscale.modal.run.
        suggestion: `https://${workspace}--${appName}-upscale.modal.run`,
      };
    }
    return {
      level: 'error',
      message: 'modal.com is the dashboard. The endpoint host ends in .modal.run.',
    };
  }

  if (!/\.modal\.run$/i.test(url.hostname)) {
    return {
      level: 'warn',
      message: 'Modal endpoints normally end in .modal.run — double-check this.',
    };
  }

  return { level: 'ok', message: 'Looks like a Modal endpoint URL.' };
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
