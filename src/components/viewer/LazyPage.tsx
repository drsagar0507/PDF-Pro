import { useInView } from '../../hooks/useInView';
import { useUiStore } from '../../store/useUiStore';
import type { PageRef } from '../../lib/types';
import { displaySize, pageTotalRotation } from '../../lib/geometry';
import PageView from './PageView';

interface Props {
  page: PageRef;
  pageNumber: number;
}

export default function LazyPage({ page, pageNumber }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const zoom = useUiStore((s) => s.zoom);
  const rotation = pageTotalRotation(page);
  const size = displaySize(page.width, page.height, rotation);

  return (
    <div ref={ref} data-page-number={pageNumber} style={{ minHeight: inView ? undefined : size.height * zoom }}>
      {inView ? (
        <PageView page={page} pageNumber={pageNumber} />
      ) : (
        <div
          className="mx-auto mb-4 animate-pulse bg-white/60 shadow-md dark:bg-neutral-800/40"
          style={{ width: size.width * zoom, height: size.height * zoom }}
        />
      )}
    </div>
  );
}
