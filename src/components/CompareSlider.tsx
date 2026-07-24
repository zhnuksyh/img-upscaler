import { useCallback, useEffect, useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Interactive before/after split viewer. Drag the vertical handle (mouse or
 * touch) or use arrow keys to reveal the original vs. upscaled image.
 */
export default function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Original',
  afterLabel = 'Upscaled',
}: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(100, Math.max(0, pct)));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => dragging.current && setFromClientX(e.clientX);
    const onUp = () => (dragging.current = false);
    const onTouch = (e: TouchEvent) => {
      if (dragging.current && e.touches[0]) setFromClientX(e.touches[0].clientX);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('touchend', onUp);
    };
  }, [setFromClientX]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
      style={{ touchAction: 'pan-y' }}
    >
      {/* After (full, underneath) */}
      <img
        src={afterUrl}
        alt={afterLabel}
        className="block w-full"
        draggable={false}
      />

      {/* Before (clipped to the left of the handle) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${pos}%` }}
      >
        <img
          src={beforeUrl}
          alt={beforeLabel}
          // Match the after image's rendered width so both align.
          className="absolute inset-0 h-full max-w-none object-cover"
          style={{ width: containerRef.current?.clientWidth ?? '100%' }}
          draggable={false}
        />
        <span className="absolute left-2 top-2 rounded bg-slate-950/70 px-2 py-0.5 text-xs font-medium text-slate-200 ring-1 ring-slate-700">
          {beforeLabel}
        </span>
      </div>

      <span className="absolute right-2 top-2 rounded bg-slate-950/70 px-2 py-0.5 text-xs font-medium text-slate-200 ring-1 ring-slate-700">
        {afterLabel}
      </span>

      {/* Handle */}
      <div
        role="slider"
        aria-label="Comparison position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onMouseDown={() => (dragging.current = true)}
        onTouchStart={() => (dragging.current = true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 2));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 2));
        }}
        className="absolute inset-y-0 z-10 flex w-8 -translate-x-1/2 cursor-ew-resize items-center justify-center focus:outline-none"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/80" />
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-900 shadow-lg ring-2 ring-brand-500/40">
          <MoveHorizontal size={16} />
        </span>
      </div>
    </div>
  );
}
