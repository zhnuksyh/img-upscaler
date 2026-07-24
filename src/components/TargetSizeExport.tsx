import { useState } from 'react';
import { Download, Loader2, Minimize2 } from 'lucide-react';
import { saveAs } from 'file-saver';

import {
  compressToTargetSize,
  type CompressFormat,
} from '../services/compressService';
import type { UpscaleJob } from '../types';
import { formatBytes } from '../utils';

interface TargetSizeExportProps {
  job: UpscaleJob;
}

type Unit = 'KiB' | 'MiB';

const FORMATS: Array<{ value: CompressFormat; label: string; ext: string }> = [
  { value: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { value: 'image/webp', label: 'WebP', ext: 'webp' },
];

/**
 * "Compress to a target file size" for a single completed result. Re-encodes
 * the result Blob the browser already holds down to a byte budget (e.g. 500
 * KiB) with no backend round-trip, then lets the user download it.
 */
export default function TargetSizeExport({ job }: TargetSizeExportProps) {
  const [amount, setAmount] = useState('500');
  const [unit, setUnit] = useState<Unit>('KiB');
  const [format, setFormat] = useState<CompressFormat>('image/jpeg');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    blob: Blob;
    width: number;
    height: number;
  } | null>(null);

  const targetBytes = Math.round(
    (Number(amount) || 0) * (unit === 'MiB' ? 1024 * 1024 : 1024),
  );

  const baseName = (() => {
    const dot = job.file.name.lastIndexOf('.');
    return dot > 0 ? job.file.name.slice(0, dot) : job.file.name;
  })();
  const ext = FORMATS.find((f) => f.value === format)?.ext ?? 'jpg';

  const run = async () => {
    if (!job.resultBlob || targetBytes <= 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const out = await compressToTargetSize(job.resultBlob, targetBytes, format);
      setResult({ blob: out.blob, width: out.width, height: out.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    saveAs(result.blob, `${baseName}_${job.options.scale}x_target.${ext}`);
  };

  return (
    <div className="card mt-2 px-3 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300">
        <Minimize2 size={13} className="text-slate-400" />
        Compress to target size
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {(['KiB', 'MiB'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={
                'px-2.5 py-1.5 text-xs transition-colors ' +
                (unit === u
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200')
              }
            >
              {u}
            </button>
          ))}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFormat(f.value)}
              className={
                'px-2.5 py-1.5 text-xs transition-colors ' +
                (format === f.value
                  ? 'bg-brand-500/15 text-brand-300'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200')
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={run}
          disabled={busy || targetBytes <= 0}
          className="btn-secondary text-xs"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {busy ? 'Compressing…' : 'Compress'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      {result && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
          <span className="text-slate-400">
            {result.width} × {result.height} px ·{' '}
            <span className="font-medium text-slate-200">
              {formatBytes(result.blob.size)}
            </span>
            {result.blob.size <= targetBytes ? (
              <span className="text-emerald-400"> · within target</span>
            ) : (
              <span className="text-amber-400"> · smallest possible</span>
            )}
          </span>
          <button type="button" onClick={download} className="btn-primary text-xs">
            <Download size={13} />
            Download
          </button>
        </div>
      )}
    </div>
  );
}
