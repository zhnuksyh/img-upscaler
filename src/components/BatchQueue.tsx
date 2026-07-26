import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Trash2,
} from 'lucide-react';
import type { JobStatus, UpscaleJob } from '../types';
import { cx, formatBytes, formatTarget } from '../utils';

interface BatchQueueProps {
  jobs: UpscaleJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDownload: (job: UpscaleJob) => void;
}

const STATUS_META: Record<
  JobStatus,
  { label: string; className: string }
> = {
  queued: { label: 'Queued', className: 'text-slate-400' },
  processing: { label: 'Processing', className: 'text-brand-400' },
  done: { label: 'Done', className: 'text-emerald-400' },
  error: { label: 'Error', className: 'text-rose-400' },
  cancelled: { label: 'Cancelled', className: 'text-slate-500' },
};

export default function BatchQueue({
  jobs,
  selectedId,
  onSelect,
  onRemove,
  onDownload,
}: BatchQueueProps) {
  if (jobs.length === 0) {
    return (
      <div className="card grid place-items-center px-6 py-10 text-center">
        <p className="text-sm text-slate-500">
          No images queued yet. Drop some files above to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((job) => {
        const meta = STATUS_META[job.status];
        const selected = job.id === selectedId;
        return (
          <li key={job.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(job.id)}
              onKeyDown={(e) =>
                (e.key === 'Enter' || e.key === ' ') &&
                (e.preventDefault(), onSelect(job.id))
              }
              className={cx(
                'card flex items-center gap-3 p-2.5 transition-colors',
                selected
                  ? 'ring-2 ring-brand-500/60'
                  : 'hover:border-slate-700',
                'cursor-pointer',
              )}
            >
              <img
                src={job.originalUrl}
                alt={job.file.name}
                className="h-14 w-14 flex-shrink-0 rounded-lg object-cover ring-1 ring-slate-800"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {job.file.name}
                  </p>
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <StatusIcon status={job.status} />
                  <span className={meta.className}>{meta.label}</span>
                  <span aria-hidden>·</span>
                  <span>{formatBytes(job.file.size)}</span>
                  {job.width && (
                    <>
                      <span aria-hidden>·</span>
                      <span>
                        {job.width}×{job.height} → {formatTarget(job.options)}
                      </span>
                    </>
                  )}
                </p>

                {job.status === 'processing' && (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-300"
                      style={{ width: `${Math.max(6, job.progress)}%` }}
                    />
                  </div>
                )}
                {job.status === 'error' && job.message && (
                  <p className="mt-1 truncate text-xs text-rose-400/90" title={job.message}>
                    {job.message}
                  </p>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-1">
                {job.status === 'done' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(job);
                    }}
                    className="btn-ghost p-2"
                    aria-label={`Download ${job.file.name}`}
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(job.id);
                  }}
                  disabled={job.status === 'processing'}
                  className="btn-ghost p-2 text-slate-400 hover:text-rose-400 disabled:opacity-40"
                  aria-label={`Remove ${job.file.name}`}
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusIcon({ status }: { status: JobStatus }) {
  switch (status) {
    case 'processing':
      return <Loader2 size={13} className="animate-spin text-brand-400" />;
    case 'done':
      return <CheckCircle2 size={13} className="text-emerald-400" />;
    case 'error':
      return <AlertCircle size={13} className="text-rose-400" />;
    default:
      return <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />;
  }
}
