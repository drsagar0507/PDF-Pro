import { X } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useUiStore } from '../../store/useUiStore';
import PageThumb from './PageThumb';

interface Props {
  onClose: () => void;
}

export default function MobilePageSheet({ onClose }: Props) {
  const pages = useDocStore((s) => s.pages);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);

  function goTo(pageNumber: number) {
    const el = document.querySelector(`[data-page-number="${pageNumber}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onClose();
  }

  const titleId = 'mobile-page-sheet-title';
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end sm:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative max-h-[70vh] rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id={titleId} className="text-sm font-semibold">Pages ({pages.length})</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 overflow-y-auto p-4" style={{ maxHeight: 'calc(70vh - 56px)' }}>
          {pages.map((page, i) => (
            <button
              key={page.id}
              onClick={() => goTo(i + 1)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 p-1 ${
                currentPageIndex === i ? 'border-indigo-500' : 'border-transparent'
              }`}
            >
              <div className="w-full overflow-hidden rounded border border-neutral-300 shadow-sm dark:border-neutral-700">
                <PageThumb page={page} targetWidth={220} />
              </div>
              <span className="text-[11px] text-neutral-600 dark:text-neutral-400">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
