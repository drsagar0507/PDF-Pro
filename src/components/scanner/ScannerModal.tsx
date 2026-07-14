import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  X,
  Camera,
  RotateCcw,
  Check,
  Trash2,
  Upload,
  ImagePlus,
  SwitchCamera,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Crop,
} from 'lucide-react';
import { warpPerspective, type Point } from '../../lib/perspectiveWarp';
import { detectDocumentQuad } from '../../lib/documentDetect';
import { enhanceScan, type ScanFilter } from '../../lib/scanEnhance';

interface ScannedPage {
  id: string;
  canvas: HTMLCanvasElement;
}

interface Props {
  onClose: () => void;
  onDone: (files: File[]) => void | Promise<void>;
}

type Phase = 'camera' | 'adjust' | 'review';

const DEFAULT_CORNERS = (): [Point, Point, Point, Point] => [
  { x: 0.08, y: 0.06 },
  { x: 0.92, y: 0.06 },
  { x: 0.92, y: 0.94 },
  { x: 0.08, y: 0.94 },
];

const LOUPE_SIZE = 112;
const LOUPE_ZOOM = 2.6;

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  out.getContext('2d')!.drawImage(src, 0, 0);
  return out;
}

export default function ScannerModal({ onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('camera');
  const [session, setSession] = useState<ScannedPage[]>([]);
  const [captured, setCaptured] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>(DEFAULT_CORNERS());
  const [autoDetected, setAutoDetected] = useState(false);
  const [filter, setFilter] = useState<ScanFilter>('color');
  const [reviewCanvas, setReviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [finishing, setFinishing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [dragging, setDragging] = useState<{ index: number; clientX: number; clientY: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgFrameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Unfiltered warp output — kept aside so switching filters in the review
  // step re-derives from the original pixels instead of compounding
  // enhancement passes on top of each other.
  const rawWarpedRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    setCameraError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled) setCameraError('Camera unavailable — you can still upload a photo below.');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [phase, facingMode]);

  function applyDetectedCorners(canvas: HTMLCanvasElement) {
    const detected = detectDocumentQuad(canvas);
    setCorners(detected ?? DEFAULT_CORNERS());
    setAutoDetected(!!detected);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas);
    applyDetectedCorners(canvas);
    setPhase('adjust');
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maxDim = 2200;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setCaptured(canvas);
      applyDetectedCorners(canvas);
      setPhase('adjust');
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  }

  function startCornerDrag(index: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const frame = imgFrameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();

    function update(clientX: number, clientY: number) {
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      setCorners((prev) => {
        const next = [...prev] as [Point, Point, Point, Point];
        next[index] = { x, y };
        return next;
      });
      setDragging({ index, clientX, clientY });
    }
    update(e.clientX, e.clientY);
    setAutoDetected(false);

    function onMove(ev: PointerEvent) {
      update(ev.clientX, ev.clientY);
    }
    function onUp() {
      setDragging(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function confirmAdjust() {
    if (!captured) return;
    setProcessing(true);
    try {
      // Yield a frame so the "Processing…" state paints before the
      // (synchronous, CPU-bound) warp + enhance pipeline runs.
      await new Promise((r) => setTimeout(r, 30));
      const px = (c: Point) => ({ x: c.x * captured.width, y: c.y * captured.height });
      const [tl, tr, br, bl] = corners.map(px);
      const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const bottomW = Math.hypot(br.x - bl.x, br.y - bl.y);
      const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
      const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
      const outW = Math.round(Math.max(topW, bottomW));
      const outH = Math.round(Math.max(leftH, rightH));

      const warped = warpPerspective(captured, [tl, tr, br, bl], Math.max(outW, 50), Math.max(outH, 50));
      rawWarpedRef.current = warped;
      const preview = cloneCanvas(warped);
      enhanceScan(preview, filter);
      setReviewCanvas(preview);
      setPhase('review');
    } finally {
      setProcessing(false);
    }
  }

  function reapplyFilter(next: ScanFilter) {
    setFilter(next);
    if (!rawWarpedRef.current) return;
    const preview = cloneCanvas(rawWarpedRef.current);
    enhanceScan(preview, next);
    setReviewCanvas(preview);
  }

  function keepReviewedPage() {
    if (!reviewCanvas) return;
    setSession((s) => [...s, { id: crypto.randomUUID(), canvas: reviewCanvas }]);
    setReviewCanvas(null);
    rawWarpedRef.current = null;
    setCaptured(null);
    setPhase('camera');
  }

  function retakeFromReview() {
    setReviewCanvas(null);
    rawWarpedRef.current = null;
    setCaptured(null);
    setPhase('camera');
  }

  function backToAdjustFromReview() {
    // Keep the original photo and current corners so re-cropping starts
    // from where they left off, not from scratch.
    setReviewCanvas(null);
    rawWarpedRef.current = null;
    setPhase('adjust');
  }

  function retake() {
    setCaptured(null);
    setPhase('camera');
  }

  function removePage(id: string) {
    setSession((s) => s.filter((p) => p.id !== id));
  }

  function movePage(index: number, delta: number) {
    setSession((s) => {
      const next = [...s];
      const target = index + delta;
      if (target < 0 || target >= next.length) return s;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function finish() {
    if (session.length === 0) return;
    setFinishing(true);
    try {
      const files: File[] = [];
      for (let idx = 0; idx < session.length; idx++) {
        const blob: Blob = await new Promise((resolve, reject) =>
          session[idx].canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92),
        );
        files.push(new File([blob], `scan-${idx + 1}.jpg`, { type: 'image/jpeg' }));
      }
      await onDone(files);
    } catch (err) {
      console.error(err);
      toast.error('Could not process scanned pages');
    } finally {
      setFinishing(false);
    }
  }

  // Loupe geometry: reproject the dragged corner's fractional position onto
  // the displayed image's rendered pixel box so the zoomed preview lines up
  // exactly with what's under the finger, even though the finger itself
  // covers that spot.
  let loupeStyle: React.CSSProperties | null = null;
  let loupeBg: React.CSSProperties | null = null;
  if (dragging && imgFrameRef.current) {
    const rect = imgFrameRef.current.getBoundingClientRect();
    const c = corners[dragging.index];
    const px = c.x * rect.width;
    const py = c.y * rect.height;
    const loupeTop = py - LOUPE_SIZE * 1.3 < 0 ? py + LOUPE_SIZE * 0.8 : py - LOUPE_SIZE * 1.3;
    loupeStyle = {
      left: Math.min(Math.max(px - LOUPE_SIZE / 2, 4), rect.width - LOUPE_SIZE - 4),
      top: loupeTop,
      width: LOUPE_SIZE,
      height: LOUPE_SIZE,
    };
    loupeBg = {
      backgroundImage: captured ? `url(${captured.toDataURL('image/jpeg', 0.7)})` : undefined,
      backgroundSize: `${rect.width * LOUPE_ZOOM}px ${rect.height * LOUPE_ZOOM}px`,
      backgroundPosition: `${-(px * LOUPE_ZOOM - LOUPE_SIZE / 2)}px ${-(py * LOUPE_ZOOM - LOUPE_SIZE / 2)}px`,
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10">
          <X size={20} />
        </button>
        <h3 className="text-sm font-medium">
          {phase === 'review' ? 'Review Scan' : phase === 'adjust' ? 'Adjust Crop' : 'Scan Document'}
        </h3>
        <div className="w-8" />
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {phase === 'camera' && (
          <>
            {cameraError ? (
              <div className="flex flex-col items-center gap-3 px-8 text-center text-white/70">
                <Camera size={40} />
                <p className="text-sm">{cameraError}</p>
              </div>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="max-h-full max-w-full" />
            )}
            <div
              className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${flash ? 'opacity-80' : 'opacity-0'}`}
            />
          </>
        )}

        {phase === 'adjust' && captured && (
          <div ref={imgFrameRef} className="relative max-h-full max-w-full select-none">
            <img
              src={captured.toDataURL('image/jpeg', 0.85)}
              alt="captured"
              className="max-h-[70vh] max-w-full"
              draggable={false}
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <polygon
                points={corners.map((c) => `${c.x * 100},${c.y * 100}`).join(' ')}
                fill="rgba(99,102,241,0.22)"
                stroke="#6366F1"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onPointerDown={(e) => startCornerDrag(i, e)}
                className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-indigo-500 shadow-lg active:scale-110 active:cursor-grabbing"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              />
            ))}
            {loupeStyle && (
              <div
                className="pointer-events-none absolute overflow-hidden rounded-full border-2 border-white shadow-2xl"
                style={loupeStyle}
              >
                <div className="h-full w-full" style={loupeBg ?? undefined} />
                <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-indigo-400" />
                <div className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-indigo-400" />
              </div>
            )}
            {processing && (
              <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
                <Loader2 size={28} className="animate-spin text-white" />
              </div>
            )}
          </div>
        )}

        {phase === 'review' && reviewCanvas && (
          <div className="flex max-h-full max-w-full flex-col items-center gap-3 overflow-y-auto p-3">
            <img
              src={reviewCanvas.toDataURL('image/jpeg', 0.92)}
              alt="scanned page"
              className="max-h-[68vh] max-w-full rounded shadow-2xl"
            />
            <p className="text-xs text-white/50">Look it over — retake, adjust the crop, or change the filter below</p>
          </div>
        )}
      </div>

      {phase === 'camera' && (
        <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
          {session.length > 0 && (
            <div className="flex w-full gap-2 overflow-x-auto pb-1">
              {session.map((p, i) => (
                <div key={p.id} className="group relative flex-none">
                  <img
                    src={p.canvas.toDataURL('image/jpeg', 0.6)}
                    alt=""
                    className="h-16 w-12 rounded border border-white/30 object-cover"
                  />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{i + 1}</span>
                  <button
                    onClick={() => removePage(p.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <Trash2 size={10} />
                  </button>
                  {i > 0 && (
                    <button
                      onClick={() => movePage(i, -1)}
                      className="absolute -bottom-1.5 -left-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-white group-hover:flex"
                    >
                      <ChevronLeft size={11} />
                    </button>
                  )}
                  {i < session.length - 1 && (
                    <button
                      onClick={() => movePage(i, 1)}
                      className="absolute -bottom-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-white group-hover:flex"
                    >
                      <ChevronRight size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex w-full items-center justify-between">
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
              title="Upload a photo instead"
            >
              <Upload size={18} />
            </button>

            <button
              onClick={capture}
              disabled={!!cameraError}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-30"
            >
              <div className="h-12 w-12 rounded-full bg-white" />
            </button>

            <button
              onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
              title="Switch camera"
            >
              <SwitchCamera size={18} />
            </button>
          </div>

          {session.length > 0 && (
            <button
              onClick={finish}
              disabled={finishing}
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/30 disabled:opacity-60"
            >
              {finishing ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {finishing ? 'Processing…' : `Done — create PDF (${session.length})`}
            </button>
          )}
        </div>
      )}

      {phase === 'adjust' && (
        <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
          {autoDetected && (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
              <Sparkles size={12} /> Edges auto-detected — fine-tune if needed
            </div>
          )}
          <div className="flex items-center gap-4">
            <button onClick={retake} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white">
              <RotateCcw size={15} /> Retake
            </button>
            <button
              onClick={confirmAdjust}
              disabled={processing}
              className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/30 disabled:opacity-60"
            >
              {processing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Straighten & continue
            </button>
          </div>
          {!autoDetected && <p className="text-center text-xs text-white/50">Drag the corners to match the edges of the page</p>}
        </div>
      )}

      {phase === 'review' && (
        <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
          <div className="flex gap-2">
            {(['color', 'grayscale', 'bw'] as ScanFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => reapplyFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                  filter === f ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/80'
                }`}
              >
                {f === 'bw' ? 'B & W' : f}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button onClick={retakeFromReview} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white">
              <RotateCcw size={15} /> Retake
            </button>
            <button onClick={backToAdjustFromReview} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white">
              <Crop size={15} /> Adjust crop
            </button>
            <button
              onClick={keepReviewedPage}
              className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-600/30"
            >
              <Check size={15} /> Keep this page
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
