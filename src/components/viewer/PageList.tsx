import { useDocStore } from '../../store/useDocStore';
import LazyPage from './LazyPage';

export default function PageList() {
  const pages = useDocStore((s) => s.pages);

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        No pages to display
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-full px-4 py-6" id="page-scroll-list">
      {pages.map((page, i) => (
        <LazyPage key={page.id} page={page} pageNumber={i + 1} />
      ))}
    </div>
  );
}
