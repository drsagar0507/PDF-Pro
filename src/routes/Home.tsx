import { useEffect, useRef, useState } from 'react';
import {
  FileUp,
  Combine,
  Scissors,
  LayoutGrid,
  PenTool,
  MessageSquareText,
  Stamp,
  Hash,
  Image as ImageIcon,
  ShieldCheck,
  FileText,
  Trash2,
  Loader2,
  ScanLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDocStore } from '../store/useDocStore';
import { useUiStore } from '../store/useUiStore';
import type { EditorMode } from '../lib/types';
import { listRecentFiles, deleteRecentFile } from '../lib/db';
import type { RecentFile } from '../lib/types';
import { asBufferSource } from '../lib/fileIO';
import ScannerModal from '../components/scanner/ScannerModal';

interface Tool {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  mode: EditorMode;
  accept: string;
  multiple: boolean;
  accent: string;
  category: string;
}

const CATEGORIES = ['Create', 'Edit & organize', 'Sign & review', 'Finish & protect'] as const;

const TOOLS: Tool[] = [
  {
    id: 'open',
    label: 'Open PDF',
    description: 'View, read, and navigate any PDF',
    icon: FileText,
    mode: 'view',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-indigo-500 to-indigo-600',
    category: 'Create',
  },
  {
    id: 'imagetopdf',
    label: 'Image to PDF',
    description: 'Turn photos and scans into a PDF',
    icon: ImageIcon,
    mode: 'organize',
    accept: 'image/png,image/jpeg',
    multiple: true,
    accent: 'from-emerald-500 to-emerald-600',
    category: 'Create',
  },
  {
    id: 'merge',
    label: 'Merge Files',
    description: 'Combine PDFs and images into one file',
    icon: Combine,
    mode: 'organize',
    accept: '.pdf,application/pdf,image/png,image/jpeg',
    multiple: true,
    accent: 'from-blue-500 to-blue-600',
    category: 'Edit & organize',
  },
  {
    id: 'organize',
    label: 'Organize Pages',
    description: 'Reorder, rotate, delete, and insert pages',
    icon: LayoutGrid,
    mode: 'organize',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-violet-500 to-violet-600',
    category: 'Edit & organize',
  },
  {
    id: 'split',
    label: 'Split & Extract',
    description: 'Pull pages out into new PDFs',
    icon: Scissors,
    mode: 'organize',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-fuchsia-500 to-fuchsia-600',
    category: 'Edit & organize',
  },
  {
    id: 'fillsign',
    label: 'Fill & Sign',
    description: 'Fill forms and sign with a drawn, typed, or uploaded signature',
    icon: PenTool,
    mode: 'fillsign',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-amber-500 to-amber-600',
    category: 'Sign & review',
  },
  {
    id: 'annotate',
    label: 'Comment & Annotate',
    description: 'Highlight, draw, add sticky notes and text',
    icon: MessageSquareText,
    mode: 'annotate',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-rose-500 to-rose-600',
    category: 'Sign & review',
  },
  {
    id: 'watermark',
    label: 'Watermark',
    description: 'Stamp text across every page',
    icon: Stamp,
    mode: 'pagetools',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-teal-500 to-teal-600',
    category: 'Finish & protect',
  },
  {
    id: 'pagenumbers',
    label: 'Page Numbers',
    description: 'Add page numbers in any position',
    icon: Hash,
    mode: 'pagetools',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-cyan-500 to-cyan-600',
    category: 'Finish & protect',
  },
  {
    id: 'protect',
    label: 'Protect',
    description: 'Encrypt a PDF with a password (AES-256)',
    icon: ShieldCheck,
    mode: 'protect',
    accept: '.pdf,application/pdf',
    multiple: false,
    accent: 'from-slate-500 to-slate-600',
    category: 'Finish & protect',
  },
];

export default function Home() {
  const addFiles = useDocStore((s) => s.addFiles);
  const setMode = useDocStore((s) => s.setMode);
  const reset = useDocStore((s) => s.reset);
  const goEditor = useUiStore((s) => s.goEditor);
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [loadingToolId, setLoadingToolId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    listRecentFiles().then(setRecents).catch(() => {});
  }, []);

  // Handle app-shortcut launches (long-press icon on Android / right-click
  // on desktop) — e.g. ?action=scan opens the camera immediately.
  useEffect(() => {
    const action = new URLSearchParams(window.location.search).get('action');
    if (!action) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (action === 'scan') setScannerOpen(true);
    if (action === 'fillsign') inputRefs.current['fillsign']?.click();
  }, []);

  async function openFiles(files: File[], mode: EditorMode) {
    if (files.length === 0) return;
    reset();
    setMode(mode);
    await addFiles(files);
    goEditor();
  }

  async function handleToolFiles(tool: Tool, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setLoadingToolId(tool.id);
    try {
      await openFiles(Array.from(fileList), tool.mode);
    } catch (err) {
      console.error(err);
      toast.error('Could not open that file — it may be corrupted or password protected.');
    } finally {
      setLoadingToolId(null);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => /pdf|png|jpe?g/i.test(f.type) || /\.(pdf|png|jpe?g)$/i.test(f.name),
    );
    if (files.length === 0) {
      toast.error('Drop a PDF or image file');
      return;
    }
    setLoadingToolId('dropzone');
    try {
      await openFiles(files, files.length > 1 ? 'organize' : 'view');
    } finally {
      setLoadingToolId(null);
    }
  }

  async function openRecent(file: RecentFile) {
    const asFile = new File([asBufferSource(file.bytes)], file.name, { type: 'application/pdf' });
    await openFiles([asFile], 'view');
  }

  async function removeRecent(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteRecentFile(id);
    setRecents((r) => r.filter((f) => f.id !== id));
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      {/* Ambient background wash — a restrained mesh gradient instead of
       * flat gray, the difference between "template" and "product." */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-gradient-to-br from-indigo-400/25 to-violet-400/10 blur-3xl dark:from-indigo-500/15 dark:to-violet-500/10" />
        <div className="absolute -right-32 top-20 h-[26rem] w-[26rem] rounded-full bg-gradient-to-bl from-fuchsia-300/15 to-transparent blur-3xl dark:from-fuchsia-500/10" />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-6 py-10 sm:px-10">
        <header className="animate-fade-in mb-12 flex items-center gap-4">
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
            <FileText size={26} strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
              PDF Pro
            </h1>
            <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
              Edit, sign, and organize PDFs — entirely on your device.
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            100% private — nothing uploaded
          </span>
        </header>

      <main>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`animate-fade-in group relative mb-10 flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
          dragOver
            ? 'scale-[1.01] border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-500/10 dark:bg-indigo-950/30'
            : 'border-neutral-300 bg-white/70 backdrop-blur-sm hover:border-indigo-300 hover:bg-white hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900/70 dark:hover:border-neutral-600 dark:hover:bg-neutral-900'
        }`}
        style={{ animationDelay: '40ms' }}
      >
        <div
          className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-violet-500/10 transition-transform duration-200 ${dragOver ? '-translate-y-1 scale-105' : 'group-hover:-translate-y-0.5'}`}
        >
          {loadingToolId === 'dropzone' ? (
            <Loader2 className="animate-spin text-indigo-500" size={26} />
          ) : (
            <FileUp className={`text-indigo-500 transition-colors ${dragOver ? 'text-indigo-600' : ''}`} size={26} />
          )}
        </div>
        <p className="mb-1 text-base font-medium text-neutral-900 dark:text-white">Drop a PDF or image here</p>
        <p className="mb-5 text-sm text-neutral-600 dark:text-neutral-400">or choose a tool below</p>
        <input
          ref={(el) => {
            inputRefs.current['open'] = el;
          }}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleToolFiles(TOOLS[0], e.target.files)}
        />
        <button onClick={() => inputRefs.current['open']?.click()} className="btn-primary px-5 py-2.5">
          Browse files
        </button>
      </div>

      {CATEGORIES.map((category, catIndex) => (
        <div key={category} className={catIndex > 0 ? 'mt-8' : ''}>
          <h2
            className="animate-fade-in mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400"
            style={{ animationDelay: `${80 + catIndex * 40}ms` }}
          >
            {category}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {category === 'Create' && (
              <ToolCard
                label="Scan Document"
                description="Use your camera to scan pages into a PDF"
                icon={ScanLine}
                accent="from-orange-500 to-red-500"
                delay={100}
                onClick={() => setScannerOpen(true)}
              />
            )}
            {TOOLS.filter((t) => t.category === category).map((tool, i) => (
              <ToolCard
                key={tool.id}
                label={tool.label}
                description={tool.description}
                icon={tool.icon}
                accent={tool.accent}
                delay={120 + catIndex * 40 + i * 20}
                loading={loadingToolId === tool.id}
                onClick={() => inputRefs.current[tool.id]?.click()}
              >
                <input
                  ref={(el) => {
                    inputRefs.current[tool.id] = el;
                  }}
                  type="file"
                  accept={tool.accept}
                  multiple={tool.multiple}
                  className="hidden"
                  onChange={(e) => handleToolFiles(tool, e.target.files)}
                />
              </ToolCard>
            ))}
          </div>
        </div>
      ))}

      {recents.length > 0 && (
        <div className="mt-12 animate-fade-in" style={{ animationDelay: '80ms' }}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
            Recent files
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {recents.map((file) => (
              <button
                key={file.id}
                onClick={() => openRecent(file)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                  {file.thumbnailDataUrl ? (
                    <img
                      src={file.thumbnailDataUrl}
                      alt=""
                      className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <FileText size={28} className="text-neutral-300 dark:text-neutral-600" />
                  )}
                </div>
                <div className="flex items-start gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{file.name}</div>
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-400">
                      {file.pageCount} page{file.pageCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => removeRecent(file.id, e)}
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/70 group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      </main>

      <footer className="mt-auto pt-12 text-center text-xs text-neutral-600 dark:text-neutral-400">
        Your files are processed entirely in your browser. Nothing is uploaded anywhere.
      </footer>

      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onDone={async (files) => {
            setScannerOpen(false);
            await openFiles(files, 'organize');
          }}
        />
      )}
      </div>
    </div>
  );
}

function ToolCard({
  label,
  description,
  icon: Icon,
  accent,
  delay,
  loading,
  onClick,
  children,
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  delay: number;
  loading?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className="animate-fade-in card-surface group relative flex flex-col items-start gap-3 overflow-hidden p-4 text-left transition-all duration-200 hover:-translate-y-1 hover:border-neutral-300 hover:shadow-lg active:translate-y-0 active:shadow-sm dark:hover:border-neutral-700"
    >
      {children}
      <div
        className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20 ${accent}`}
      />
      <div
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:scale-110 ${accent}`}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </div>
      <div className="relative">
        <div className="text-sm font-medium text-neutral-900 dark:text-white">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{description}</div>
      </div>
    </button>
  );
}
