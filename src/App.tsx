import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileArchive, Images } from 'lucide-react';

import Header from './components/Header';
import DropZone from './components/DropZone';
import Controls from './components/Controls';
import BatchQueue from './components/BatchQueue';
import CompareSlider from './components/CompareSlider';
import SettingsModal from './components/SettingsModal';
import HistoryGallery from './components/HistoryGallery';

import { resetClient, upscaleImage, UpscaleError } from './services/upscalerApi';
import { downloadBatchZip, downloadJob } from './services/zipService';
import { isUsingDefault, loadConfig, saveConfig } from './services/config';

import {
  DEFAULT_OPTIONS,
  type EndpointConfig,
  type GalleryItem,
  type UpscaleJob,
  type UpscaleOptions,
} from './types';
import { readImageSize, uid } from './utils';

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

  const usingDefault = useMemo(() => isUsingDefault(config), [config]);
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

      patchJob(id, {
        status: 'processing',
        progress: 8,
        message: 'Connecting…',
      });

      try {
        const blob = await upscaleImage(job.file, job.options, config, (text) =>
          patchJob(id, { message: text, progress: 40 }),
        );

        if (cancelRef.current) {
          patchJob(id, { status: 'cancelled', message: 'Cancelled' });
          continue;
        }

        const resultUrl = trackUrl(URL.createObjectURL(blob));
        patchJob(id, {
          status: 'done',
          progress: 100,
          resultBlob: blob,
          resultUrl,
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
            scale: job.options.scale,
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
        usingDefaultEndpoint={usingDefault}
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
                {completedCount > 1 && (
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
              onChange={setOptions}
              onUpscaleAll={processAll}
              onCancel={cancel}
              onClear={clearAll}
              processing={processing}
              pendingCount={pendingCount}
              hasJobs={jobs.length > 0}
            />

            <p className="mt-3 px-1 text-xs leading-relaxed text-slate-600">
              All processing runs remotely on Hugging Face ZeroGPU. Your images
              never touch a central server — the browser talks straight to the
              Space and holds results in memory for this session only.
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
