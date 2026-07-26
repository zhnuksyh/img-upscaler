import { Github, Settings, Sparkles } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  /** Whether a backend endpoint has been configured. */
  configured: boolean;
  githubUrl?: string;
}

export default function Header({
  onOpenSettings,
  configured,
  githubUrl = 'https://github.com/zhnuksyh/img-upscaler',
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30">
            <Sparkles size={18} />
          </span>
          <div className="leading-tight">
            <h1 className="text-base font-semibold text-slate-100">
              AI Image Upscaler
            </h1>
            <p className="text-xs text-slate-500">
              Real-ESRGAN · Cloud GPU · 100% client-side
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={
              'hidden rounded-full px-2.5 py-1 text-xs font-medium ring-1 sm:inline-flex ' +
              (configured
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                : 'bg-amber-500/10 text-amber-400 ring-amber-500/30')
            }
            title={
              configured
                ? 'Backend endpoint configured.'
                : 'No backend configured. Open Settings and paste your Modal endpoint URL.'
            }
          >
            {configured ? 'Endpoint set' : 'Set up endpoint'}
          </span>

          {/* Icon-only: aria-label carries the accessible name, title the tooltip. */}
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost px-2"
            aria-label="View source on GitHub"
            title="View source on GitHub"
          >
            <Github size={18} />
          </a>

          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-secondary px-2"
            aria-label="Open settings"
            title="Open settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
