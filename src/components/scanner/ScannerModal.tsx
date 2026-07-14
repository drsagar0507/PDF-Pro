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
} from 'lucide-react';
import { warpPerspective, type Point } from '../../lib/perspectiveWarp';

type Filter = 'color' | 'grayscale' | 'bw';

interface ScannedPage {
  id: string;
  canvas: HTMLCanvasElement;
}

interface Props {
  onClose: () => void;
  onDone: (files: File[]) => void | Promise<void>;
}

const DEFAULT_CORNERS = (): [Point, Point, Point, Point] => [
  { x: 0.08, y: 0.06 },
  { x: 0.92, y: 0.06 },
  { x: 0.92, y: 0.94 },
  { x: 0.08, y: 0.94 },
];

function applyFilter(canvas: HTMLCanvasElement, filter: Filter): HTMLCanvasElement {
  if (filter === 'color') return canvas;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (filter === 'grayscale') {
      d[i] = d[i + 1] = d[i + 2] = gray;
    } else {
      const enhanced = (gray - 128) * 1.6 + 128 + 25;
      const v = enhanced > 150 ? 255 : enhanced < 90 ? 0 : enhanced;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export default function ScannerModal({ onClose, onDone }: Props) {
  const [phase, setPhase] = useState<'camera' | 'adjust'>('camera');
  const [session, setSession] = useState<ScannedPage[]>([]);
  const [captured, setCaptured] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<[Point, Point, Point, Point]>(DEFAULT_CORNERS());
  const [filter, setFilter] = useState<Filter>('color');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [finishing, setFinishing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imgFrameRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const maxDim = 2000;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas);
    setCorners(DEFAULT_CORNERS());
    setPhase('adjust');
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maxDim = 2000;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setCaptured(canvas);
      setCorners(DEFAULT_CORNERS());
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
    }
    update(e.clientX, e.clientY);

    function onMove(ev: PointerEvent) {
      update(ev.clientX, ev.clientY);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function confirmAdjust() {
    if (!captured) return;
    const px = (c: Point) => ({ x: c.x * captured.width, y: c.y * captured.height });
    const [tl, tr, br, bl] = corners.map(px);
    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const bottomW = Math.hypot(br.x - bl.x, br.y - bl.y);
    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
    const outW = Math.round(Math.max(topW, bottomW));
    const outH = Math.round(Math.max(leftH, rightH));

    const warped = warpPerspective(captured, [tl, tr, br, bl], Math.max(outW, 50), Math.max(outH, 50));
    applyFilter(warped, filter);

    setSession((s) => [...s, { id: crypto.randomUUID(), canvas: warped }]);
    setCaptured(null);
    setPhase('camera');
  }

  function retake() {
    setCaptured(null);
    setPhase('camera');
  }

  function removePage(id: string) {
    setSession((s) => s.filter((p) => p.id !== id));
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10">
          <X size={20} />
        </button>
        <h3 className="text-sm font-medium">Scan Document</h3>
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
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <polygon
                points={corners.map((c) => `${c.x * 100}%,${c.y * 100}%`).join(' ')}
                fill="rgba(99,102,241,0.25)"
                stroke="#6366F1"
                strokeWidth={2}
              />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onPointerDown={(e) => startCornerDrag(i, e)}
                className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-indigo-500 shadow-lg active:cursor-grabbing"
                style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {phase === 'camera' && (
        <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
          {session.length > 0 && (
            <div className="flex w-full gap-2 overflow-x-auto pb-1">
              {session.map((p) => (
                <div key={p.id} className="relative flex-none">
                  <img
                    src={p.canvas.toDataURL('image/jpeg', 0.6)}
                    alt=""
                    className="h-16 w-12 rounded border border-white/30 object-cover"
                  />
                  <button
                    onClick={() => removePage(p.id)}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <Trash2 size={9} />
                  </button>
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
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-30"
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
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <ImagePlus size={15} />
              {finishing ? 'Processing…' : `Done — create PDF (${session.length})`}
            </button>
          )}
        </div>
      )}

      {phase === 'adjust' && (
        <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-3">
          <div className="flex gap-2">
            {(['color', 'grayscale', 'bw'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                  filter === f ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/80'
                }`}
              >
                {f === 'bw' ? 'B & W' : f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={retake} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white">
              <RotateCcw size={15} /> Retake
            </button>
            <button onClick={confirmAdjust} className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white">
              <Check size={15} /> Use this scan
            </button>
          </div>
          <p className="text-center text-xs text-white/50">Drag the corners to match the edges of the page</p>
        </div>
      )}
    </div>
  );
}
