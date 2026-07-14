import { useEffect, useMemo, useRef } from 'react';
import type { PageRef } from '../../lib/types';
import { useDocStore } from '../../store/useDocStore';
import { displaySize, pageTotalRotation } from '../../lib/geometry';
import { getPdfjsDoc } from '../../lib/docCache';

interface Props {
  page: PageRef;
  targetWidth?: number;
}

export default function PageThumb({ page, targetWidth = 120 }: Props) {
  const source = useDocStore((s) => s.sources[page.sourceId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = pageTotalRotation(page);
  const dispSize = displaySize(page.width, page.height, rotation);
  const scale = targetWidth / dispSize.width;
  const cssHeight = dispSize.height * scale;

  useEffect(() => {
    if (!source || source.kind !== 'pdf') return;
    let cancelled = false;
    (async () => {
      const doc = await getPdfjsDoc(source.id, source.bytes);
      const pdfPage = await doc.getPage(page.pageIndex + 1);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      try {
        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch {
        /* ignore cancelled render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, page.pageIndex, scale, rotation]);

  const imageUrl = useMemo(() => {
    if (!source || source.kind !== 'image') return null;
    const blob = new Blob([source.bytes.buffer as ArrayBuffer], {
      type: source.imageFormat === 'png' ? 'image/png' : 'image/jpeg',
    });
    return URL.createObjectURL(blob);
  }, [source]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  if (!source) return null;

  return (
    <div className="relative bg-white" style={{ width: targetWidth, height: cssHeight }}>
      {source.kind === 'pdf' ? (
        <canvas ref={canvasRef} className="block h-full w-full" />
      ) : (
        imageUrl && (
          <div className="relative h-full w-full overflow-hidden">
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2"
              style={{
                width: page.width * scale,
                height: page.height * scale,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
            />
          </div>
        )
      )}
    </div>
  );
}
