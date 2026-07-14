import { useEffect, useRef, useState } from 'react';
import type { PageRef } from '../../lib/types';
import { useDocStore } from '../../store/useDocStore';
import { displaySize, pageTotalRotation } from '../../lib/geometry';
import { getPdfjsDoc } from '../../lib/docCache';
import { asBufferSource } from '../../lib/fileIO';

interface Props {
  page: PageRef;
  /** Backing-store render resolution in px — the element itself always
   * fills its parent's width via CSS and scales down cleanly. */
  targetWidth?: number;
}

export default function PageThumb({ page, targetWidth = 220 }: Props) {
  const source = useDocStore((s) => s.sources[page.sourceId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = pageTotalRotation(page);
  const dispSize = displaySize(page.width, page.height, rotation);
  const scale = targetWidth / dispSize.width;
  const aspectRatio = `${dispSize.width} / ${dispSize.height}`;

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

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!source || source.kind !== 'image') {
      setImageUrl(null);
      return;
    }
    // Create and revoke within the same effect run (not split across a
    // useMemo + separate cleanup effect) — otherwise React StrictMode's
    // double-invoked mount/cleanup/mount revokes the URL that's still
    // being displayed, leaving the <img> pointing at a dead blob: URL.
    const blob = new Blob([asBufferSource(source.bytes)], {
      type: source.imageFormat === 'png' ? 'image/png' : 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  if (!source) return null;

  return (
    <div className="relative w-full bg-white" style={{ aspectRatio }}>
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
