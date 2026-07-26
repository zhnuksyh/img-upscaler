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
/** Sub-1x factors, resampled in the browser with no GPU call. */
const DOWNSCALES: ScaleFactor[] = [0.25, 0.5, 0.75];

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

        {/* Two ways to shrink: by percentage, or to a file-size budget. */}
        <div className="mb-2 flex overflow-hidden rounded-lg border border-slate-700 text-xs">
          {(
            [
              ['factor', 'By percent'],
              ['filesize', 'To file size'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              disabled={processing}
              onClick={() =>
                onChange({
                  ...options,
                  shrinkMode: mode,
                  // Entering either shrink mode implies a downscale; default to
                  // 50% so the choice takes effect without a second click.
                  scale: local ? options.scale : 0.5,
                })
              }
              className={cx(
                'flex-1 px-2.5 py-1.5 transition-colors disabled:opacity-50',
                local && options.shrinkMode === mode
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {options.shrinkMode === 'filesize' ? (
          <SizeBudget
            bytes={options.targetBytes}
            disabled={processing}
            onChange={(targetBytes) =>
              onChange({
                ...options,
                targetBytes,
                shrinkMode: 'filesize',
                scale: local ? options.scale : 0.5,
              })
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {DOWNSCALES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={processing}
                onClick={() => onChange({ ...options, scale: s, shrinkMode: 'factor' })}
                className={cx(
                  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
                  local && options.scale === s
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600',
                )}
              >
                {formatScale(s)}
              </button>
            ))}
          </div>
        )}

        {options.scale === 8 && (
          <p className="mt-2 text-xs text-slate-500">
            8× enlarges the 4× model output, so it adds size rather than extra
            detail.
          </p>
        )}
        {local && (
          <p className="mt-2 text-xs text-slate-500">
            {options.shrinkMode === 'filesize'
              ? 'Shrinks dimensions until the file fits your budget. Saved as JPEG.'
              : 'Runs in your browser — no endpoint needed and no GPU credits used.'}
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
        <input
          type="checkbox"
          checked={options.faceRestore && !local}
          disabled={processing || local}
          onChange={(e) => onChange({ ...options, faceRestore: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-slate-900"
        />
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
