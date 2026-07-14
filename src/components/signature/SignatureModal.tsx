import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { X, Upload } from 'lucide-react';

interface Props {
  kind: 'signature' | 'initials';
  onClose: () => void;
  onConfirm: (dataUrl: string, save: boolean, name: string) => void;
}

type Tab = 'draw' | 'type' | 'upload';

const FONTS = [
  { id: 'font-sig-dancing', family: 'Dancing Script', label: 'Elegant' },
  { id: 'font-sig-caveat', family: 'Caveat', label: 'Casual' },
  { id: 'font-sig-vibes', family: 'Great Vibes', label: 'Formal' },
];

const COLORS: { hex: string; name: string }[] = [
  { hex: '#111827', name: 'Black' },
  { hex: '#1D4ED8', name: 'Blue' },
  { hex: '#0F766E', name: 'Teal' },
];

export default function SignatureModal({ kind, onClose, onConfirm }: Props) {
  const [tab, setTab] = useState<Tab>('draw');
  const [color, setColor] = useState(COLORS[0].hex);
  const [typedText, setTypedText] = useState('');
  const [fontFamily, setFontFamily] = useState(FONTS[0].family);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (tab !== 'draw' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { penColor: color, backgroundColor: 'rgba(0,0,0,0)' });
    padRef.current = pad;
    return () => pad.off();
  }, [tab, color]);

  function clearDraw() {
    padRef.current?.clear();
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setUploadedUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function renderTypedToDataUrl(): Promise<string> {
    return new Promise((resolve) => {
      const size = 56;
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `${size}px "${fontFamily}"`;
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(typedText || 'Your Name', canvas.width / 2, canvas.height / 2);
        resolve(canvas.toDataURL('image/png'));
      };
      const fontSpec = `${size}px "${fontFamily}"`;
      if (document.fonts?.check(fontSpec)) {
        draw();
      } else {
        document.fonts.load(fontSpec).then(draw).catch(draw);
      }
    });
  }

  async function handleConfirm() {
    const name = typedText.trim() || (kind === 'signature' ? 'Signature' : 'Initials');
    if (tab === 'draw') {
      if (!padRef.current || padRef.current.isEmpty()) return;
      onConfirm(padRef.current.toDataURL('image/png'), saveToLibrary, name);
    } else if (tab === 'type') {
      if (!typedText.trim()) return;
      const url = await renderTypedToDataUrl();
      onConfirm(url, saveToLibrary, name);
    } else if (tab === 'upload') {
      if (!uploadedUrl) return;
      onConfirm(uploadedUrl, saveToLibrary, name);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <h3 className="text-sm font-semibold">
            {kind === 'signature' ? 'Create signature' : 'Create initials'}
          </h3>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-neutral-200 px-5 pt-3 dark:border-neutral-800">
          {(['draw', 'type', 'upload'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                tab === t
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'draw' && (
            <div>
              <canvas
                ref={canvasRef}
                className="h-40 w-full rounded-lg border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
                style={{ touchAction: 'none' }}
              />
              <div className="mt-3 flex items-center justify-between">
                <ColorPicker color={color} setColor={setColor} />
                <button onClick={clearDraw} className="text-xs text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Clear
                </button>
              </div>
            </div>
          )}

          {tab === 'type' && (
            <div>
              <input
                autoFocus
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder="Type your name"
                className="mb-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700 dark:bg-neutral-800"
              />
              <div className="mb-3 flex h-28 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                <span style={{ fontFamily, color, fontSize: 40 }}>{typedText || 'Your Name'}</span>
              </div>
              <div className="mb-3 flex gap-2">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFontFamily(f.family)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition ${
                      fontFamily === f.family
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                    style={{ fontFamily: f.family }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <ColorPicker color={color} setColor={setColor} />
            </div>
          )}

          {tab === 'upload' && (
            <div>
              {uploadedUrl ? (
                <div className="mb-3 flex h-32 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800">
                  <img src={uploadedUrl} alt="signature" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <label className="mb-3 flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 text-neutral-400 hover:border-indigo-400 hover:text-indigo-500 dark:border-neutral-700">
                  <Upload size={22} />
                  <span className="text-xs">PNG with transparent background works best</span>
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleUpload} />
                </label>
              )}
              {uploadedUrl && (
                <button onClick={() => setUploadedUrl(null)} className="text-xs text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Choose a different image
                </button>
              )}
            </div>
          )}

          <label className="mt-4 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
            Save to my signatures for reuse
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Use {kind === 'signature' ? 'signature' : 'initials'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ color, setColor }: { color: string; setColor: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c.hex}
          onClick={() => setColor(c.hex)}
          aria-label={`${c.name} ink color`}
          aria-pressed={color === c.hex}
          title={c.name}
          className={`h-5 w-5 rounded-full border-2 ${color === c.hex ? 'border-indigo-500' : 'border-transparent'}`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}
