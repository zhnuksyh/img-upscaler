import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileArchive, Images } from 'lucide-react';

import Header from './components/Header';
import DropZone from './components/DropZone';
import Controls from './components/Controls';
import BatchQueue from './components/BatchQueue';
import CompareSlider from './components/CompareSlider';
import SettingsModal from './components/SettingsModal';
import HistoryGallery from './components/HistoryGallery';
import TargetSizeExport from './components/TargetSizeExport';

import { resetClient, upscaleImage, UpscaleError } from './services/upscalerApi';
import { downloadBatchZip, downloadJob } from './services/zipService';
import { isEndpointConfigured, loadConfig, saveConfig } from './services/config';

import {
  DEFAULT_OPTIONS,
  type EndpointConfig,
  type GalleryItem,
  type UpscaleJob,
  type UpscaleOptions,
} from './types';
import { formatBytes, readImageSize, uid } from './utils';

export default function App() {
  const [config, setConfig] = useState<EndpointConfig>(() => loadConfig());
  const [options, setOptions] = useState<UpscaleOptions>(DEFAULT_OPTIONS);
  const [jobs, setJobs] = useState<UpscaleJob[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const cancelRef = useRef(false);
  // Live ref of jobs so the async batch loop reads current state.
  const jobsRef = useRef<UpscaleJob[]>(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  // Live ref of the controls so the async batch loop sends current settings.
  const optionsRef = useRef<UpscaleOptions>(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  // Track object URLs for cleanup on unmount.
  const urlsRef = useRef<Set<string>>(new Set());

  const trackUrl = useCallback((url: string) => {
    urlsRef.current.add(url);
    return url;
  }, []);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const configured = useMemo(() => isEndpointConfigured(config), [config]);
  const pendingCount = useMemo(
    () => jobs.filter((j) => j.status === 'queued' || j.status === 'error').length,
    [jobs],
  );
  const completedCount = useMemo(
    () => jobs.filter((j) => j.status === 'done').length,
    [jobs],
  );
  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  const patchJob = useCallback((id: string, patch: Partial<UpscaleJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  /**
   * The controls are the single source of truth for scale/face/tile settings:
   * changing them re-arms every job so the next run uses what the UI shows,
   * rather than the values that happened to be set at upload time. A job that
   * already finished under different settings goes back to `queued` so the new
   * choice actually takes effect.
   */
  const changeOptions = useCallback((next: UpscaleOptions) => {
    setOptions(next);
    setJobs((prev) =>
      prev.map((j) => {
        if (j.status === 'processing') return j;
        const differs =
          j.options.scale !== next.scale ||
          j.options.faceRestore !== next.faceRestore ||
          j.options.tileSize !== next.tileSize ||
          j.options.tilePad !== next.tilePad;
        if (!differs) return j;
        return {
          ...j,
          options: next,
          // Re-queue finished/cancelled work so the new settings are applied.
          status: 'queued',
          progress: 0,
          message: undefined,
        };
      }),
    );
  }, []);

  // --- File intake -------------------------------------------------------

  const addFiles = useCallback(
    async (files: File[]) => {
      const created: UpscaleJob[] = files.map((file) => ({
        id: uid(),
        file,
        originalUrl: trackUrl(URL.createObjectURL(file)),
        status: 'queued',
        progress: 0,
        options,
        createdAt: Date.now(),
      }));

      setJobs((prev) => [...prev, ...created]);
      setSelectedId((cur) => cur ?? created[0]?.id ?? null);

      // Read dimensions asynchronously so the queue can show them.
      for (const job of created) {
        readImageSize(job.originalUrl)
          .then((size) => patchJob(job.id, size))
          .catch(() => {});
      }
    },
    [options, patchJob, trackUrl],
  );

  // --- Batch processing --------------------------------------------------

  const processAll = useCallback(async () => {
    if (processing) return;
    // Nudge the user to configure a backend before their first upscale.
    if (!isEndpointConfigured(config)) {
      setSettingsOpen(true);
      return;
    }
    cancelRef.current = false;
    setProcessing(true);

    // Snapshot ids to process (queued or previously errored, for retry).
    const targets = jobs
      .filter((j) => j.status === 'queued' || j.status === 'error')
      .map((j) => j.id);

    for (const id of targets) {
      if (cancelRef.current) {
        patchJob(id, { status: 'cancelled', message: 'Cancelled' });
        continue;
      }

      const job = jobsRef.current.find((j) => j.id === id);
      if (!job) continue;
      // Always send what the controls currently show, not a stale snapshot.
      const jobOptions = optionsRef.current;

      patchJob(id, {
        status: 'processing',
        progress: 8,
        message: 'Connecting…',
      });

      try {
        const blob = await upscaleImage(job.file, jobOptions, config, (text) =>
          patchJob(id, { message: text, progress: 40 }),
        );

        if (cancelRef.current) {
          patchJob(id, { status: 'cancelled', message: 'Cancelled' });
          continue;
        }

        const resultUrl = trackUrl(URL.createObjectURL(blob));
        // Read the upscaled dimensions so the UI can show before → after.
        const resultSize = await readImageSize(resultUrl).catch(() => null);
        patchJob(id, {
          status: 'done',
          progress: 100,
          // Pin the settings this result was produced with, so the labels and
          // download filename describe the image the user is actually looking at.
          options: jobOptions,
          resultBlob: blob,
          resultUrl,
          resultWidth: resultSize?.width,
          resultHeight: resultSize?.height,
          resultSize: blob.size,
          message: undefined,
        });
        setSelectedId(id);

        setGallery((prev) => [
          {
            id: uid(),
            name: job.file.name,
            originalUrl: job.originalUrl,
            resultUrl,
            resultBlob: blob,
            scale: jobOptions.scale,
            createdAt: Date.now(),
          },
          ...prev,
        ]);
      } catch (err) {
        const message =
          err instanceof UpscaleError
            ? err.message
            : 'Unexpected error during upscaling.';
        patchJob(id, { status: 'error', progress: 0, message });

        // A quota/rate-limit failure will hit every remaining job the same
        // way — stop the batch so the rest stay queued and retryable later.
        if (err instanceof UpscaleError && err.quota) break;
      }
    }

    setProcessing(false);
  }, [processing, jobs, config, patchJob, trackUrl]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const clearAll = useCallback(() => {
    if (processing) return;
    setJobs([]);
    setSelectedId(null);
  }, [processing]);

  const removeJob = useCallback(
    (id: string) => {
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setSelectedId((cur) => (cur === id ? null : cur));
    },
    [],
  );

  // --- Settings ----------------------------------------------------------

  const handleSaveSettings = useCallback((next: EndpointConfig) => {
    saveConfig(next);
    setConfig(next);
    resetClient();
    setSettingsOpen(false);
  }, []);

  // --- Export ------------------------------------------------------------

  const handleZip = useCallback(async () => {
    setZipping(true);
    try {
      await downloadBatchZip(jobs);
    } finally {
      setZipping(false);
    }
  }, [jobs]);

  return (
    <div className="min-h-full">
      <Header
        onOpenSettings={() => setSettingsOpen(true)}
        configured={configured}
      />

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Left column: dropzone, preview, queue */}
          <div className="flex min-w-0 flex-col gap-6">
            <DropZone onFiles={addFiles} disabled={processing} />

            {selectedJob?.status === 'done' &&
            selectedJob.resultUrl &&
            selectedJob.originalUrl ? (
              <section className="animate-fade-in">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-200">
                    Compare — {selectedJob.file.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => downloadJob(selectedJob)}
                    className="btn-secondary text-xs"
                  >
                    Download result
                  </button>
                </div>
                <CompareSlider
                  beforeUrl={selectedJob.originalUrl}
                  afterUrl={selectedJob.resultUrl}
                />
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="card px-3 py-2">
                    <p className="text-slate-500">Before</p>
                    <p className="mt-0.5 font-medium text-slate-300">
                      {selectedJob.width && selectedJob.height
                        ? `${selectedJob.width} × ${selectedJob.height} px`
                        : '—'}
                      <span className="text-slate-500">
                        {' · '}
                        {formatBytes(selectedJob.file.size)}
                      </span>
                    </p>
                  </div>
                  <div className="card px-3 py-2">
                    <p className="text-brand-400/80">
                      After · {selectedJob.options.scale}×
                    </p>
                    <p className="mt-0.5 font-medium text-slate-200">
                      {selectedJob.resultWidth && selectedJob.resultHeight
                        ? `${selectedJob.resultWidth} × ${selectedJob.resultHeight} px`
                        : '—'}
                      <span className="text-slate-500">
                        {' · '}
                        {selectedJob.resultSize
                          ? formatBytes(selectedJob.resultSize)
                          : '—'}
                      </span>
                    </p>
                  </div>
                </div>
                <TargetSizeExport job={selectedJob} />
              </section>
            ) : selectedJob ? (
              <section className="card animate-fade-in overflow-hidden">
                <img
                  src={selectedJob.originalUrl}
                  alt={selectedJob.file.name}
                  className="mx-auto max-h-[420px] w-auto object-contain"
                />
              </section>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Images size={16} className="text-slate-500" />
                  Queue
                  {jobs.length > 0 && (
                    <span className="text-xs font-normal text-slate-500">
                      ({completedCount}/{jobs.length} done)
                    </span>
                  )}
                </h2>
                {completedCount >= 1 && (
                  <button
                    type="button"
                    onClick={handleZip}
                    disabled={zipping}
                    className="btn-secondary text-xs"
                  >
                    <FileArchive size={14} />
                    {zipping ? 'Zipping…' : `Download ZIP (${completedCount})`}
                  </button>
                )}
              </div>
              <BatchQueue
                jobs={jobs}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRemove={removeJob}
                onDownload={downloadJob}
              />
            </section>

            <HistoryGallery
              items={gallery}
              onSelect={(item) => {
                // Focus the matching completed job if it is still queued.
                const match = jobs.find(
                  (j) => j.resultUrl === item.resultUrl,
                );
                if (match) setSelectedId(match.id);
              }}
            />
          </div>

          {/* Right column: controls */}
          <aside className="lg:sticky lg:top-20 lg:h-fit">
            <Controls
              options={options}
              onChange={changeOptions}
              onUpscaleAll={processAll}
              onCancel={cancel}
              onClear={clearAll}
              processing={processing}
              pendingCount={pendingCount}
              hasJobs={jobs.length > 0}
            />

            <p className="mt-3 px-1 text-xs leading-relaxed text-slate-600">
              All processing runs remotely on a cloud GPU backend. Your images
              never touch a central server — the browser talks straight to your
              endpoint and holds results in memory for this session only.
            </p>
          </aside>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        config={config}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
