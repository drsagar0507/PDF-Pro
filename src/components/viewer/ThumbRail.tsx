import { useDocStore } from '../../store/useDocStore';
import { useUiStore } from '../../store/useUiStore';
import PageThumb from './PageThumb';

export default function ThumbRail() {
  const pages = useDocStore((s) => s.pages);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);

  function goTo(pageNumber: number) {
    const el = document.querySelector(`[data-page-number="${pageNumber}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <aside className="hidden w-36 flex-none overflow-y-auto border-r border-neutral-200 bg-neutral-50 p-3 sm:block dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="flex flex-col gap-3">
        {pages.map((page, i) => (
          <button
            key={page.id}
            onClick={() => goTo(i + 1)}
            className={`group flex flex-col items-center gap-1 rounded-md p-1 transition ${
              currentPageIndex === i ? 'bg-indigo-100 dark:bg-indigo-950/50' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <div
              className={`overflow-hidden rounded border shadow-sm ${
                currentPageIndex === i ? 'border-indigo-500' : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              <PageThumb page={page} targetWidth={112} />
            </div>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{i + 1}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
