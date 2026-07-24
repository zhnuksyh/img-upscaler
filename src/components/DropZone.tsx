import { useCallback, useRef, useState } from 'react';
import { ImagePlus, UploadCloud } from 'lucide-react';
import { cx, isAcceptedImage } from '../utils';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropZone({ onFiles, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const all = Array.from(list);
      const accepted = all.filter(isAcceptedImage);
      setRejected(all.length - accepted.length);
      if (accepted.length) onFiles(accepted);
    },
    [onFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'group relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
          disabled && 'cursor-not-allowed opacity-60',
          dragging
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/70',
        )}
      >
        <span
          className={cx(
            'grid h-14 w-14 place-items-center rounded-full transition-colors',
            dragging
              ? 'bg-brand-500/20 text-brand-300'
              : 'bg-slate-800 text-slate-400 group-hover:text-slate-200',
          )}
        >
          {dragging ? <UploadCloud size={26} /> : <ImagePlus size={26} />}
        </span>
        <div>
          <p className="text-sm font-medium text-slate-200">
            {dragging ? 'Drop to add images' : 'Drag & drop images here'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            or <span className="text-brand-400">browse</span> · PNG, JPG, WEBP · batch supported
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {rejected > 0 && (
        <p className="mt-2 text-xs text-amber-400">
          {rejected} file{rejected > 1 ? 's were' : ' was'} skipped (unsupported type).
        </p>
      )}
    </div>
  );
}
