import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useDocStore } from '../../store/useDocStore';
import { useUiStore } from '../../store/useUiStore';
import type { Annotation, PageRef } from '../../lib/types';
import { displaySize, nativeRectToDisplay, pageTotalRotation } from '../../lib/geometry';
import { getPdfjsDoc } from '../../lib/docCache';
import { asBufferSource } from '../../lib/fileIO';
import FormFieldLayer from './FormFieldLayer';
import AnnotationShape from './AnnotationShape';

interface Props {
  page: PageRef;
  pageNumber: number;
}

const DEFAULT_SIG_WIDTH = 170;
const DEFAULT_STAMP_SIZE = 60;

// Stable reference so the Zustand selector below doesn't hand back a brand
// new array every render when a page has no annotations yet — returning a
// fresh `[]` there causes an infinite render loop (React's
// useSyncExternalStore sees a "changed" snapshot on every read).
const EMPTY_ANNOTATIONS: Annotation[] = [];

export default function PageView({ page, pageNumber }: Props) {
  const source = useDocStore((s) => s.sources[page.sourceId]);
  const annotations = useDocStore((s) => s.annotations[page.id] ?? EMPTY_ANNOTATIONS);
  const addAnnotation = useDocStore((s) => s.addAnnotation);
  const updateAnnotation = useDocStore((s) => s.updateAnnotation);
  const removeAnnotation = useDocStore((s) => s.removeAnnotation);
  const mode = useDocStore((s) => s.mode);

  const zoom = useUiStore((s) => s.zoom);
  const setCurrentPageIndex = useUiStore((s) => s.setCurrentPageIndex);
  const annotateTool = useUiStore((s) => s.annotateTool);
  const annotateColor = useUiStore((s) => s.annotateColor);
  const fillSignTool = useUiStore((s) => s.fillSignTool);
  const activeSignatureDataUrl = useUiStore((s) => s.activeSignatureDataUrl);
  const searchHighlight = useUiStore((s) => s.searchHighlight);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [inkPreview, setInkPreview] = useState<{ x: number; y: number }[] | null>(null);
  const [showSearchFlash, setShowSearchFlash] = useState(false);

  useEffect(() => {
    if (searchHighlight?.pageId !== page.id) return;
    setShowSearchFlash(true);
    const t = setTimeout(() => setShowSearchFlash(false), 2200);
    return () => clearTimeout(t);
  }, [searchHighlight, page.id]);

  const rotation = pageTotalRotation(page);
  const dispSize = useMemo(() => displaySize(page.width, page.height, rotation), [page.width, page.height, rotation]);
  const cssWidth = dispSize.width * zoom;
  const cssHeight = dispSize.height * zoom;

  const interactive = mode === 'annotate' || mode === 'fillsign';
  const activeTool = mode === 'annotate' ? annotateTool : mode === 'fillsign' ? fillSignTool : 'select';

  // Render PDF page to canvas (or draw the raw image for image sources).
  useEffect(() => {
    if (!source || source.kind !== 'pdf') return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    (async () => {
      const doc = await getPdfjsDoc(source.id, source.bytes);
      const pdfPage = await doc.getPage(page.pageIndex + 1);
      if (cancelled) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: zoom, rotation });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = pdfPage.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      renderTask = task;
      try {
        await task.promise;
      } catch {
        /* cancelled render, ignore */
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [source, page.pageIndex, zoom, rotation]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!source || source.kind !== 'image') {
      setImageUrl(null);
      return;
    }
    // See PageThumb.tsx for why creation + cleanup must live in the same
    // effect (StrictMode double-invoke otherwise revokes a live blob: URL).
    const blob = new Blob([asBufferSource(source.bytes)], {
      type: source.imageFormat === 'png' ? 'image/png' : 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  function clientToDisplay(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  function clampToPage(x: number, y: number) {
    return { x: Math.min(Math.max(x, 0), dispSize.width), y: Math.min(Math.max(y, 0), dispSize.height) };
  }

  function finishBoxCreate(x: number, y: number, w: number, h: number) {
    const color = annotateColor;
    let newId: string | null = null;
    if (activeTool === 'highlight') {
      newId = addAnnotation(page.id, { kind: 'highlight', x, y, width: w, height: h, color, opacity: 0.42 });
    } else if (activeTool === 'checkmark' || activeTool === 'xmark' || activeTool === 'circle' || activeTool === 'line') {
      newId = addAnnotation(page.id, { kind: activeTool, x, y, width: w, height: h, color: '#DC2626', strokeWidth: 3 });
    } else if (activeTool === 'signature' || activeTool === 'initials') {
      if (!activeSignatureDataUrl) {
        toast.error('Pick or create a signature first');
        return;
      }
      newId = addAnnotation(page.id, { kind: 'image', x, y, width: w, height: h, color, dataUrl: activeSignatureDataUrl });
    }
    // Select immediately so the move/resize/rotate/delete handles are
    // available right away — without this, placing a signature required an
    // extra click on it before you could do anything further with it.
    setSelectedId(newId);
  }

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    setSelectedId(null);

    if (!interactive || activeTool === 'select' || activeTool === 'eraser') return;

    const startPt = clientToDisplay(e.clientX, e.clientY);
    const start = clampToPage(startPt.x, startPt.y);

    if (activeTool === 'text') {
      const id = addAnnotation(page.id, {
        kind: 'text',
        x: start.x,
        y: start.y,
        width: 220,
        fontSize: 14,
        text: '',
        color: '#111827',
      });
      setSelectedId(id);
      return;
    }
    if (activeTool === 'date') {
      const dateStr = new Date().toLocaleDateString();
      addAnnotation(page.id, { kind: 'text', x: start.x, y: start.y, width: 140, fontSize: 13, text: dateStr, color: '#111827' });
      return;
    }
    if (activeTool === 'note') {
      const id = addAnnotation(page.id, { kind: 'note', x: start.x, y: start.y, text: '', color: '#FDE68A' });
      setSelectedId(id);
      return;
    }

    if (activeTool === 'ink') {
      const points = [start];
      setInkPreview(points);
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const raw = clientToDisplay(ev.clientX, ev.clientY);
        const p = clampToPage(raw.x, raw.y);
        points.push(p);
        setInkPreview([...points]);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (points.length > 1) {
          addAnnotation(page.id, { kind: 'ink', points, color: annotateColor, strokeWidth: 3 });
        }
        setInkPreview(null);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return;
    }

    // Box-drag creation tools: highlight, shapes, signature/initials.
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      const cur = clientToDisplay(ev.clientX, ev.clientY);
      const x = Math.min(start.x, cur.x);
      const y = Math.min(start.y, cur.y);
      const w = Math.abs(cur.x - start.x);
      const h = Math.abs(cur.y - start.y);
      setDragPreview({ x, y, w, h });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      setDragPreview(null);
      if (dx < 4 && dy < 4) {
        // Treat as a click: default-sized box anchored at the click point.
        const isSig = activeTool === 'signature';
        const isInit = activeTool === 'initials';
        const w = isSig ? DEFAULT_SIG_WIDTH : isInit ? DEFAULT_STAMP_SIZE : DEFAULT_STAMP_SIZE;
        const h = isSig ? DEFAULT_SIG_WIDTH * 0.4 : DEFAULT_STAMP_SIZE * 0.5;
        finishBoxCreate(
          Math.max(0, Math.min(start.x - w / 2, dispSize.width - w)),
          Math.max(0, Math.min(start.y - h / 2, dispSize.height - h)),
          w,
          h,
        );
      } else {
        const cur = clientToDisplay(ev.clientX, ev.clientY);
        const x = Math.min(start.x, cur.x);
        const y = Math.min(start.y, cur.y);
        finishBoxCreate(x, y, Math.abs(cur.x - start.x), Math.abs(cur.y - start.y));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleShapeSelect(ann: Annotation) {
    if (activeTool === 'eraser') {
      removeAnnotation(page.id, ann.id);
      return;
    }
    setSelectedId(ann.id);
  }

  if (!source) return null;

  return (
    <div
      ref={rootRef}
      data-page-number={pageNumber}
      className="relative mx-auto mb-4 bg-white shadow-md dark:shadow-black/40"
      style={{ width: cssWidth, height: cssHeight }}
      onMouseEnter={() => setCurrentPageIndex(pageNumber - 1)}
    >
      {source.kind === 'pdf' ? (
        <canvas ref={canvasRef} className="block" />
      ) : (
        imageUrl && (
          <div className="relative h-full w-full overflow-hidden">
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="absolute left-1/2 top-1/2"
              style={{
                width: page.width * zoom,
                height: page.height * zoom,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
            />
          </div>
        )
      )}

      {mode === 'fillsign' && source.kind === 'pdf' && (
        <FormFieldLayer page={page} sourceBytes={source.bytes} zoom={zoom} />
      )}

      {showSearchFlash && searchHighlight && (() => {
        const r = searchHighlight.rect;
        const box = nativeRectToDisplay(r.x0, r.y0, r.x1, r.y1, page.width, page.height, rotation);
        return (
          <div
            className="pointer-events-none absolute animate-pulse rounded-sm bg-amber-400/60 ring-2 ring-amber-500"
            style={{
              left: box.x * zoom - 3,
              top: box.y * zoom - 3,
              width: box.width * zoom + 6,
              height: box.height * zoom + 6,
            }}
          />
        );
      })()}

      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ cursor: interactive && activeTool !== 'select' ? 'crosshair' : 'default' }}
        onPointerDown={handleBackgroundPointerDown}
      >
        {annotations.map((ann) => (
          <AnnotationShape
            key={ann.id}
            ann={ann}
            zoom={zoom}
            pageWidth={dispSize.width}
            pageHeight={dispSize.height}
            selected={selectedId === ann.id}
            interactive={interactive}
            onSelect={() => handleShapeSelect(ann)}
            onChange={(patch) => updateAnnotation(page.id, ann.id, patch)}
            onDelete={() => removeAnnotation(page.id, ann.id)}
            onEditText={(text) => updateAnnotation(page.id, ann.id, { text } as Partial<Annotation>)}
          />
        ))}

        {dragPreview && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-indigo-500 bg-indigo-500/10"
            style={{ left: dragPreview.x * zoom, top: dragPreview.y * zoom, width: dragPreview.w * zoom, height: dragPreview.h * zoom }}
          />
        )}
        {inkPreview && inkPreview.length > 1 && (
          <svg className="pointer-events-none absolute inset-0 overflow-visible">
            <polyline
              points={inkPreview.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')}
              fill="none"
              stroke={annotateColor}
              strokeWidth={3 * zoom}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
