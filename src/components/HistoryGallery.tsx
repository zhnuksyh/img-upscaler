import { Clock, Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import type { GalleryItem } from '../types';
import { upscaledFileName } from '../services/zipService';

interface HistoryGalleryProps {
  items: GalleryItem[];
  onSelect: (item: GalleryItem) => void;
}

/**
 * In-browser session gallery of completed upscales. Cleared on page reload —
 * nothing is uploaded to or stored on any central server.
 */
export default function HistoryGallery({ items, onSelect }: HistoryGalleryProps) {
  if (items.length === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Clock size={15} className="text-slate-500" />
        Session history
        <span className="text-xs font-normal text-slate-500">
          ({items.length})
        </span>
      </h2>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {items.map((item) => (
          <div key={item.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="block w-full overflow-hidden rounded-lg ring-1 ring-slate-800 transition-transform hover:ring-brand-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title={`${item.name} · ${item.scale}×`}
            >
              <img
                src={item.resultUrl}
                alt={item.name}
                className="aspect-square w-full object-cover"
              />
              <span className="absolute left-1 top-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-300">
                {item.scale}×
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                saveAs(
                  item.resultBlob,
                  upscaledFileName(item.name, item.scale, item.resultBlob),
                )
              }
              className="absolute bottom-1 right-1 hidden rounded-md bg-slate-950/80 p-1.5 text-slate-200 ring-1 ring-slate-700 hover:text-brand-300 group-hover:block"
              aria-label={`Download ${item.name}`}
            >
              <Download size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
