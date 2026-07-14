import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { buildOutputPdf } from '../../lib/exportPdf';
import { exportPagesAsImages } from '../../lib/exportImages';
import { compressPdf, type CompressLevel } from '../../lib/compressPdf';
import { downloadBytes, suggestOutputName } from '../../lib/fileIO';
import { parsePageRange } from '../../lib/geometry';
import type { CropOptions, PageNumberOptions, WatermarkOptions } from '../../lib/types';

type Tab = 'watermark' | 'numbers' | 'crop' | 'images' | 'compress';

const TAB_LABELS: Record<Tab, string> = {
  watermark: 'Watermark',
  numbers: 'Page numbers',
  crop: 'Crop',
  images: 'Export images',
  compress: 'Compress',
};

export default function PageToolsPanel() {
  const [tab, setTab] = useState<Tab>('watermark');
  const [busy, setBusy] = useState(false);

  const sources = useDocStore((s) => s.sources);
  const pages = useDocStore((s) => s.pages);
  const annotations = useDocStore((s) => s.annotations);
  const formValues = useDocStore((s) => s.formValues);
  const fileName = useDocStore((s) => s.fileName);

  const [wm, setWm] = useState<WatermarkOptions>({
    text: 'CONFIDENTIAL',
    fontSize: 48,
    opacity: 0.3,
    rotation: 45,
    color: '#DC2626',
    position: 'center',
    pageRange: '',
  });

  const [pn, setPn] = useState<PageNumberOptions>({
    format: 'Page {n} of {total}',
    startAt: 1,
    fontSize: 11,
    color: '#111827',
    position: 'bottom-center',
    pageRange: '',
  });

  const [crop, setCrop] = useState<CropOptions>({ top: 0, right: 0, bottom: 0, left: 0, pageRange: '' });
  const [imgFormat, setImgFormat] = useState<'png' | 'jpeg'>('png');
  const [imgScale, setImgScale] = useState(2);
  const [imgRange, setImgRange] = useState('');
  const [compressLevel, setCompressLevel] = useState<CompressLevel>('medium');

  async function apply() {
    if (pages.length === 0) {
      toast.error('Open a PDF first');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'images') {
        const indices = parsePageRange(imgRange, pages.length);
        const { bytes, filename, mime } = await exportPagesAsImages(pages, sources, {
          format: imgFormat,
          quality: 0.92,
          scale: imgScale,
          pageIndices: indices,
        });
        downloadBytes(bytes, filename, mime);
        toast.success('Downloaded');
        return;
      }

      if (tab === 'compress') {
        const bytes = await compressPdf(pages, sources, compressLevel);
        downloadBytes(bytes, suggestOutputName(fileName, '-compressed'));
        toast.success('Downloaded');
        return;
      }

      const bytes = await buildOutputPdf(
        { sources, pages, annotations, formValues },
        {
          watermark: tab === 'watermark' ? wm : null,
          pageNumbers: tab === 'numbers' ? pn : null,
          crop: tab === 'crop' ? crop : null,
        },
      );
      const suffix = tab === 'watermark' ? '-watermarked' : tab === 'numbers' ? '-numbered' : '-cropped';
      downloadBytes(bytes, suggestOutputName(fileName, suffix));
      toast.success('Downloaded');
    } catch (err) {
      console.error(err);
      toast.error('Could not apply — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 dark:border-neutral-800 dark:bg-neutral-900 [&::-webkit-scrollbar]:hidden">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-none rounded-t-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
              tab === t ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-sm space-y-4">
          {tab === 'watermark' && (
            <>
              <Field label="Text">
                <input value={wm.text} onChange={(e) => setWm({ ...wm, text: e.target.value })} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Font size">
                  <input type="number" value={wm.fontSize} onChange={(e) => setWm({ ...wm, fontSize: +e.target.value })} className="input" />
                </Field>
                <Field label="Rotation°">
                  <input type="number" value={wm.rotation} onChange={(e) => setWm({ ...wm, rotation: +e.target.value })} className="input" />
                </Field>
              </div>
              <Field label={`Opacity (${Math.round(wm.opacity * 100)}%)`}>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={wm.opacity}
                  onChange={(e) => setWm({ ...wm, opacity: +e.target.value })}
                  className="w-full"
                />
              </Field>
              <Field label="Color">
                <input type="color" value={wm.color} onChange={(e) => setWm({ ...wm, color: e.target.value })} className="h-9 w-16" />
              </Field>
              <Field label="Position">
                <select value={wm.position} onChange={(e) => setWm({ ...wm, position: e.target.value as WatermarkOptions['position'] })} className="input">
                  <option value="center">Center</option>
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                </select>
              </Field>
              <Field label="Pages (e.g. 1-3,5 — blank = all)">
                <input value={wm.pageRange} onChange={(e) => setWm({ ...wm, pageRange: e.target.value })} className="input" placeholder="All pages" />
              </Field>
            </>
          )}

          {tab === 'numbers' && (
            <>
              <Field label="Format ({n} = page number, {total} = page count)">
                <input value={pn.format} onChange={(e) => setPn({ ...pn, format: e.target.value })} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start at">
                  <input type="number" value={pn.startAt} onChange={(e) => setPn({ ...pn, startAt: +e.target.value })} className="input" />
                </Field>
                <Field label="Font size">
                  <input type="number" value={pn.fontSize} onChange={(e) => setPn({ ...pn, fontSize: +e.target.value })} className="input" />
                </Field>
              </div>
              <Field label="Color">
                <input type="color" value={pn.color} onChange={(e) => setPn({ ...pn, color: e.target.value })} className="h-9 w-16" />
              </Field>
              <Field label="Position">
                <select value={pn.position} onChange={(e) => setPn({ ...pn, position: e.target.value as PageNumberOptions['position'] })} className="input">
                  <option value="bottom-center">Bottom center</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="top-center">Top center</option>
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                </select>
              </Field>
              <Field label="Pages (e.g. 1-3,5 — blank = all)">
                <input value={pn.pageRange} onChange={(e) => setPn({ ...pn, pageRange: e.target.value })} className="input" placeholder="All pages" />
              </Field>
            </>
          )}

          {tab === 'crop' && (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Trim margins from each page (in points, 72 = 1 inch). Content is hidden, not deleted.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Top">
                  <input type="number" min={0} value={crop.top} onChange={(e) => setCrop({ ...crop, top: +e.target.value })} className="input" />
                </Field>
                <Field label="Bottom">
                  <input type="number" min={0} value={crop.bottom} onChange={(e) => setCrop({ ...crop, bottom: +e.target.value })} className="input" />
                </Field>
                <Field label="Left">
                  <input type="number" min={0} value={crop.left} onChange={(e) => setCrop({ ...crop, left: +e.target.value })} className="input" />
                </Field>
                <Field label="Right">
                  <input type="number" min={0} value={crop.right} onChange={(e) => setCrop({ ...crop, right: +e.target.value })} className="input" />
                </Field>
              </div>
              <Field label="Pages (e.g. 1-3,5 — blank = all)">
                <input value={crop.pageRange} onChange={(e) => setCrop({ ...crop, pageRange: e.target.value })} className="input" placeholder="All pages" />
              </Field>
            </>
          )}

          {tab === 'images' && (
            <>
              <Field label="Format">
                <select value={imgFormat} onChange={(e) => setImgFormat(e.target.value as 'png' | 'jpeg')} className="input">
                  <option value="png">PNG (lossless)</option>
                  <option value="jpeg">JPEG (smaller)</option>
                </select>
              </Field>
              <Field label={`Resolution (${imgScale}x)`}>
                <input type="range" min={1} max={4} step={0.5} value={imgScale} onChange={(e) => setImgScale(+e.target.value)} className="w-full" />
              </Field>
              <Field label="Pages (e.g. 1-3,5 — blank = all)">
                <input value={imgRange} onChange={(e) => setImgRange(e.target.value)} className="input" placeholder="All pages" />
              </Field>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                One page downloads as a single image; multiple pages download as a .zip.
              </p>
            </>
          )}

          {tab === 'compress' && (
            <>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Re-encodes every page as an optimized image to shrink file size — best for scans and
                photo-heavy PDFs. Text will no longer be selectable in the result.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as CompressLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setCompressLevel(lvl)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition ${
                      compressLevel === lvl
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {lvl === 'low' ? 'Low compression' : lvl === 'medium' ? 'Balanced' : 'High compression'}
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            onClick={apply}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {tab === 'images' ? 'Export & download' : tab === 'compress' ? 'Compress & download' : 'Apply & download'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}
