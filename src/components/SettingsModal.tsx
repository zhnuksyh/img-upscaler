import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, RotateCcw, Server, X } from 'lucide-react';
import { DEFAULT_ENDPOINT, type EndpointApi, type EndpointConfig } from '../types';

interface SettingsModalProps {
  open: boolean;
  config: EndpointConfig;
  onClose: () => void;
  onSave: (config: EndpointConfig) => void;
}

export default function SettingsModal({
  open,
  config,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [spaceId, setSpaceId] = useState(config.spaceId);
  const [hfToken, setHfToken] = useState(config.hfToken);
  const [api, setApi] = useState<EndpointApi>(config.api);

  // Re-sync local form state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setSpaceId(config.spaceId);
      setHfToken(config.hfToken);
      setApi(config.api);
    }
  }, [open, config]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const resetDefaults = () => {
    setSpaceId(DEFAULT_ENDPOINT.spaceId);
    setHfToken('');
    setApi(DEFAULT_ENDPOINT.api);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg animate-fade-in rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 id="settings-title" className="text-base font-semibold text-slate-100">
            Endpoint settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost -mr-2"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm text-slate-400">
            Deploy the free <code className="text-slate-300">modal_app.py</code>{' '}
            backend (see the README), then paste its endpoint URL below. Modal
            gives free monthly GPU credits — no subscription. Settings are stored
            only in this browser's{' '}
            <code className="text-slate-300">localStorage</code>.
          </p>

          <div className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-300">
              Backend type
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['modal', 'Modal', 'Serverless GPU · recommended'],
                  ['custom', 'HF Space', "this repo's app.py"],
                  ['community', 'Public HF', '/predict (may hit CORS)'],
                ] as const
              ).map(([value, title, sub]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setApi(value)}
                  className={
                    'rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ' +
                    (api === value
                      ? 'border-brand-500 bg-brand-500/10 text-slate-200'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600')
                  }
                >
                  <span className="block font-medium">{title}</span>
                  <span className="block text-[11px] leading-tight text-slate-500">
                    {sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <Server size={14} className="text-slate-500" />
              {api === 'modal' ? 'Modal endpoint URL' : 'Space ID or URL'}
            </span>
            <input
              type="text"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              placeholder={
                api === 'modal'
                  ? 'https://you--img-upscaler-upscale.modal.run'
                  : 'owner/space-name'
              }
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <span className="mt-1 block text-xs text-slate-500">
              {api === 'modal'
                ? 'The URL printed by `modal deploy` (ends in .modal.run).'
                : 'e.g. owner/img-upscaler or a full *.hf.space URL.'}
            </span>
          </label>

          {api === 'modal' && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-xs leading-relaxed text-slate-400">
              <p>
                Modal stops the backend when your monthly usage limit is reached
                — so you're never billed, it just pauses until the next cycle.
                The browser can't read your remaining credits; check usage on
                your{' '}
                <a
                  href="https://modal.com/settings/usage"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-0.5 text-brand-400 hover:text-brand-300"
                >
                  Modal billing page <ExternalLink size={11} />
                </a>
                .
              </p>
            </div>
          )}

          <label className={api === 'modal' ? 'hidden' : 'block'}>
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <KeyRound size={14} className="text-slate-500" />
              Hugging Face token{' '}
              <span className="font-normal text-slate-500">(optional)</span>
            </span>
            <input
              type="password"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
              placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <a
              href="https://huggingface.co/settings/tokens"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
            >
              Create a free token <ExternalLink size={12} />
            </a>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-5 py-4">
          <button type="button" onClick={resetDefaults} className="btn-ghost text-xs">
            <RotateCcw size={14} />
            Reset
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave({ spaceId, hfToken, api })}
              className="btn-primary"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
