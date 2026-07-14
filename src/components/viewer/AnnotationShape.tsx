import { useState } from 'react';
import { X } from 'lucide-react';
import type { Annotation } from '../../lib/types';
import { clamp } from '../../lib/geometry';

interface Props {
  ann: Annotation;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Annotation>) => void;
  onDelete: () => void;
  onEditText?: (text: string) => void;
}

const MIN_SIZE = 8;

export default function AnnotationShape({
  ann,
  zoom,
  pageWidth,
  pageHeight,
  selected,
  interactive,
  onSelect,
  onChange,
  onDelete,
  onEditText,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const hasBox = 'x' in ann && 'width' in ann;
  const x = (ann as { x?: number }).x ?? 0;
  const y = (ann as { y?: number }).y ?? 0;
  const width = (ann as { width?: number }).width ?? 0;
  const height = (ann as { height?: number }).height ?? 0;

  function startMove(e: React.PointerEvent) {
    if (!interactive || editing) return;
    e.stopPropagation();
    onSelect();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = x;
    const origY = y;

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      const maxX = pageWidth - width;
      const maxY = pageHeight - height;
      onChange({
        x: clamp(origX + dx, 0, Math.max(0, maxX)),
        y: clamp(origY + dy, 0, Math.max(0, maxY)),
      } as Partial<Annotation>);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = width;
    const origH = height;

    function onMove(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      onChange({
        width: clamp(origW + dx, MIN_SIZE, pageWidth - x),
        height: clamp(origH + dy, MIN_SIZE, pageHeight - y),
      } as Partial<Annotation>);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const wrapperStyle: React.CSSProperties = hasBox
    ? { position: 'absolute', left: x * zoom, top: y * zoom, width: width * zoom, height: height * zoom }
    : { position: 'absolute', left: (x - 12) * zoom, top: (y - 12) * zoom, width: 24 * zoom, height: 24 * zoom };

  let content: React.ReactNode = null;

  if (ann.kind === 'highlight') {
    content = <div className="h-full w-full" style={{ background: ann.color, opacity: ann.opacity, mixBlendMode: 'multiply' }} />;
  } else if (ann.kind === 'ink') {
    const pts = ann.points.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ');
    content = (
      <svg className="pointer-events-none absolute inset-0 overflow-visible" style={{ left: 0, top: 0 }}>
        <polyline points={pts} fill="none" stroke={ann.color} strokeWidth={ann.strokeWidth * zoom} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  } else if (ann.kind === 'text') {
    content = editing ? (
      <textarea
        autoFocus
        className="h-full w-full resize-none border border-indigo-400 bg-white/95 p-0.5 leading-tight outline-none dark:bg-neutral-900/95"
        style={{ fontSize: ann.fontSize * zoom, color: ann.color, fontFamily: 'system-ui, sans-serif' }}
        defaultValue={ann.text}
        onBlur={(e) => {
          setEditing(false);
          onEditText?.(e.target.value);
        }}
      />
    ) : (
      <div
        className="h-full w-full whitespace-pre-wrap break-words leading-tight"
        style={{ fontSize: ann.fontSize * zoom, color: ann.color, fontFamily: 'system-ui, sans-serif' }}
      >
        {ann.text || <span className="text-neutral-400">Text</span>}
      </div>
    );
  } else if (ann.kind === 'note') {
    content = (
      <div
        className="flex h-full w-full items-center justify-center rounded-sm shadow"
        style={{ background: ann.color }}
        title={ann.text}
      >
        <svg viewBox="0 0 24 24" className="h-3/5 w-3/5 fill-black/60">
          <path d="M4 4h16v12H8l-4 4z" />
        </svg>
      </div>
    );
  } else if (ann.kind === 'image') {
    content = <img src={ann.dataUrl} alt="stamp" className="h-full w-full object-contain" draggable={false} />;
  } else if (ann.kind === 'checkmark') {
    content = (
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <polyline points="10,55 40,85 90,15" fill="none" stroke={ann.color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  } else if (ann.kind === 'xmark') {
    content = (
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <line x1="8" y1="8" x2="92" y2="92" stroke={ann.color} strokeWidth={10} strokeLinecap="round" />
        <line x1="92" y1="8" x2="8" y2="92" stroke={ann.color} strokeWidth={10} strokeLinecap="round" />
      </svg>
    );
  } else if (ann.kind === 'circle') {
    content = (
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <ellipse cx="50" cy="50" rx="46" ry="46" fill="none" stroke={ann.color} strokeWidth={8} />
      </svg>
    );
  } else if (ann.kind === 'line') {
    content = (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <line x1="0" y1="50" x2="100" y2="50" stroke={ann.color} strokeWidth={8} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  return (
    <div
      style={{ ...wrapperStyle, pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'move' : 'default' }}
      onPointerDown={startMove}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={() => {
        if (ann.kind === 'text' && interactive) {
          setEditing(true);
        }
        if (ann.kind === 'note' && interactive) {
          setDraft(ann.text);
          setEditing(true);
        }
      }}
      className={selected ? 'outline outline-2 outline-indigo-500' : ''}
    >
      {content}
      {ann.kind === 'note' && editing && (
        <div
          className="absolute left-full top-0 z-20 ml-2 w-56 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            autoFocus
            className="h-20 w-full resize-none rounded border border-neutral-300 p-1 text-xs outline-none dark:border-neutral-600 dark:bg-neutral-900"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
              onClick={() => {
                onEditText?.(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {selected && interactive && hasBox && (
        <div
          onPointerDown={startResize}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border-2 border-white bg-indigo-500 shadow"
        />
      )}
      {selected && interactive && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
