import { useState } from 'react';
import { Loader2, ScanFace, Sparkles, Wand2, X } from 'lucide-react';
import type { ScaleFactor, UpscaleOptions } from '../types';
import { cx, formatScale } from '../utils';

interface ControlsProps {
  options: UpscaleOptions;
  onChange: (next: UpscaleOptions) => void;
  onUpscaleAll: () => void;
  onCancel: () => void;
  onClear: () => void;
  processing: boolean;
  pendingCount: number;
  hasJobs: boolean;
}

const UPSCALES: ScaleFactor[] = [2, 4, 8];

export default function Controls({
  options,
  onChange,
  onUpscaleAll,
  onCancel,
  onClear,
  processing,
  pendingCount,
  hasJobs,
}: ControlsProps) {
  // A sub-1x factor is resampled in the browser, so the GPU-only settings
  // (face restoration, tiling) don't apply and the action verb changes.
  const local = options.scale < 1;

  return (
    <div className="card flex flex-col gap-5 p-5">
      {/* Scale factor */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Enlarge · AI upscale
        </label>
        <div className="grid grid-cols-3 gap-2">
          {UPSCALES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={processing}
              onClick={() => onChange({ ...options, scale: s })}
              className={cx(
                'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
                options.scale === s
                  ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600',
              )}
            >
              {formatScale(s)}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Make smaller · instant, no GPU
        </label>

        {/* Shrinking is file-size budgeted only: picking a byte target is the
            outcome people actually want, and the dimension search reaches it
            more precisely than a fixed percentage would. */}
        <SizeBudget
          bytes={options.targetBytes}
          disabled={processing}
          onChange={(targetBytes) =>
            onChange({
              ...options,
              targetBytes,
              shrinkMode: 'filesize',
              // Any sub-1x value marks this as a local job; the budget search
              // determines the real dimensions, so the factor is just a flag.
              scale: local ? options.scale : 0.5,
            })
          }
        />

        {options.scale === 8 && (
          <p className="mt-2 text-xs text-slate-500">
            8× enlarges the 4× model output, so it adds size rather than extra
            detail.
          </p>
        )}
        {local && (
          <p className="mt-2 text-xs text-slate-500">
            Shrinks dimensions until the file fits your budget. Saved as JPEG —
            runs in your browser, no endpoint or GPU credits needed.
          </p>
        )}
      </div>

      {/* Face restore — model-side only, so irrelevant when shrinking. */}
      <label
        className={cx(
          'flex items-start gap-3',
          local ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <span className="flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
            <ScanFace size={15} className="text-slate-400" />
            Face restoration
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {local
              ? 'Not used when shrinking — no model pass runs.'
              : 'GFPGAN enhancement for portraits and human faces.'}
          </span>
        </span>

        {/* Switch: a visually-hidden checkbox keeps native semantics and
            keyboard behaviour; the sibling span is the rendered track. */}
        <input
          type="checkbox"
          role="switch"
          checked={options.faceRestore && !local}
          disabled={processing || local}
          onChange={(e) => onChange({ ...options, faceRestore: e.target.checked })}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-slate-700
            transition-colors peer-checked:bg-brand-500
            peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500
            peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900
            after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4
            after:rounded-full after:bg-white after:transition-transform
            after:content-[''] peer-checked:after:translate-x-4"
        />
      </label>

      {/* Tiling (advanced) — GPU pass only; hidden for local resizes. */}
      <details className={cx('group', local && 'hidden')}>
        <summary className="cursor-pointer list-none text-xs font-medium text-slate-400 hover:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} /> Advanced tiling
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <Range
            label="Tile size"
            value={options.tileSize}
            min={0}
            max={1024}
            step={64}
            suffix={options.tileSize === 0 ? 'off' : 'px'}
            disabled={processing}
            onChange={(v) => onChange({ ...options, tileSize: v })}
          />
          <Range
            label="Tile padding"
            value={options.tilePad}
            min={0}
            max={64}
            step={2}
            suffix="px"
            disabled={processing}
            onChange={(v) => onChange({ ...options, tilePad: v })}
          />
          <p className="text-xs text-slate-500">
            Overlap padding prevents visible seams and avoids GPU out-of-memory
            errors on large images.
          </p>
        </div>
      </details>

      {/* Actions */}
      <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
        <button
          type="button"
          onClick={onUpscaleAll}
          disabled={processing || pendingCount === 0}
          className="btn-primary w-full"
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Wand2 size={16} />
              {local ? 'Resize' : 'Upscale'}{' '}
              {pendingCount > 0 ? `${pendingCount} image${pendingCount > 1 ? 's' : ''}` : 'all'}
            </>
          )}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={!processing}
            className="btn-secondary"
          >
            <X size={15} />
            Cancel
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={processing || !hasJobs}
            className="btn-secondary"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Free-form file-size budget: type any number, pick KB or MB.
 *
 * Keeps the typed text in local state rather than deriving it from `bytes`, so
 * a half-finished entry ("1." on the way to "1.5") isn't rewritten under the
 * cursor. Unit changes reinterpret the same number rather than converting it —
 * switching MB to KB after typing 2 means 2 KB, which is what the visible
 * field says.
 */
function SizeBudget({
  bytes,
  disabled,
  onChange,
}: {
  bytes: number;
  disabled?: boolean;
  onChange: (bytes: number) => void;
}) {
  const initialMb = bytes >= 1024 * 1024;
  const [unit, setUnit] = useState<'KB' | 'MB'>(initialMb ? 'MB' : 'KB');
  const [text, setText] = useState(
    String(+(bytes / (initialMb ? 1024 * 1024 : 1024)).toFixed(2)),
  );

  const push = (nextText: string, nextUnit: 'KB' | 'MB') => {
    const n = Number(nextText);
    if (Number.isFinite(n) && n > 0) {
      onChange(Math.round(n * (nextUnit === 'MB' ? 1024 * 1024 : 1024)));
    }
  };

  const invalid = text.trim() !== '' && !(Number(text) > 0);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step="any"
          value={text}
          disabled={disabled}
          placeholder="500"
          onChange={(e) => {
            setText(e.target.value);
            push(e.target.value, unit);
          }}
          className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
        />
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {(['KB', 'MB'] as const).map((u) => (
            <button
              key={u}
              type="button"
              disabled={disabled}
              onClick={() => {
                setUnit(u);
                push(text, u);
              }}
              className={cx(
                'px-3 py-2 text-xs transition-colors disabled:opacity-50',
                unit === u
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200',
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      {invalid && (
        <p className="mt-1 text-xs text-rose-400">Enter a number above 0.</p>
      )}
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs text-slate-400">
        {label}
        <span className="font-mono text-slate-300">
          {value} {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-brand-500 disabled:opacity-50"
      />
    </label>
  );
}
