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
}

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
    const asFile = new File([file.bytes.buffer as ArrayBuffer], file.name, { type: 'application/pdf' });
    await openFiles([asFile], 'view');
  }

  async function removeRecent(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteRecentFile(id);
    setRecents((r) => r.filter((f) => f.id !== id));
  }

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-10 sm:px-10">
      <header className="mb-10 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20">
          <FileText size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PDF Pro</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Edit, sign, and organize PDFs — 100% offline, nothing leaves your device.
          </p>
        </div>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
            : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900'
        }`}
      >
        {loadingToolId === 'dropzone' ? (
          <Loader2 className="mb-3 animate-spin text-indigo-500" size={32} />
        ) : (
          <FileUp className="mb-3 text-neutral-400" size={32} />
        )}
        <p className="mb-1 font-medium">Drop a PDF or image here</p>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">or choose a tool below</p>
        <input
          ref={(el) => {
            inputRefs.current['open'] = el;
          }}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => handleToolFiles(TOOLS[0], e.target.files)}
        />
        <button
          onClick={() => inputRefs.current['open']?.click()}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          Browse files
        </button>
      </div>

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        All tools
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <button
          onClick={() => setScannerOpen(true)}
          className="group relative flex flex-col items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-500 text-white">
            <ScanLine size={18} />
          </div>
          <div>
            <div className="text-sm font-medium">Scan Document</div>
            <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Use your camera to scan pages into a PDF
            </div>
          </div>
        </button>
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => inputRefs.current[tool.id]?.click()}
              className="group relative flex flex-col items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
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
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-white ${tool.accent}`}
              >
                {loadingToolId === tool.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Icon size={18} />
                )}
              </div>
              <div>
                <div className="text-sm font-medium">{tool.label}</div>
                <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {tool.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {recents.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Recent files
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {recents.map((file) => (
              <button
                key={file.id}
                onClick={() => openRecent(file)}
                className="group flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-left transition hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex h-10 w-8 flex-none items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
                  <FileText size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {file.pageCount} page{file.pageCount === 1 ? '' : 's'}
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => removeRecent(file.id, e)}
                  className="flex-none rounded p-1 text-neutral-300 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-600 group-hover:opacity-100 dark:hover:bg-neutral-800"
                >
                  <Trash2 size={14} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <footer className="mt-auto pt-12 text-center text-xs text-neutral-400 dark:text-neutral-600">
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
  );
}
