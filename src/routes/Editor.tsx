import { useState } from 'react';
import {
  Home,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  Eye,
  MessageSquareText,
  PenTool,
  LayoutGrid,
  Stamp,
  ShieldCheck,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { nanoid } from 'nanoid';
import { useDocStore } from '../store/useDocStore';
import { useUiStore } from '../store/useUiStore';
import type { EditorMode } from '../lib/types';
import PageList from '../components/viewer/PageList';
import ThumbRail from '../components/viewer/ThumbRail';
import OrganizeGrid from '../components/organize/OrganizeGrid';
import AnnotatePanel from '../components/panels/AnnotatePanel';
import FillSignPanel from '../components/panels/FillSignPanel';
import PageToolsPanel from '../components/panels/PageToolsPanel';
import ProtectPanel from '../components/panels/ProtectPanel';
import { buildOutputPdf } from '../lib/exportPdf';
import { downloadBytes, suggestOutputName } from '../lib/fileIO';
import { saveRecentFile } from '../lib/db';

const MODES: { id: EditorMode; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'view', icon: Eye, label: 'View' },
  { id: 'annotate', icon: MessageSquareText, label: 'Comment' },
  { id: 'fillsign', icon: PenTool, label: 'Fill & Sign' },
  { id: 'organize', icon: LayoutGrid, label: 'Organize' },
  { id: 'pagetools', icon: Stamp, label: 'Page Tools' },
  { id: 'protect', icon: ShieldCheck, label: 'Protect' },
];

export default function Editor() {
  const mode = useDocStore((s) => s.mode);
  const setMode = useDocStore((s) => s.setMode);
  const fileName = useDocStore((s) => s.fileName);
  const setFileName = useDocStore((s) => s.setFileName);
  const pages = useDocStore((s) => s.pages);
  const sources = useDocStore((s) => s.sources);
  const annotations = useDocStore((s) => s.annotations);
  const formValues = useDocStore((s) => s.formValues);
  const past = useDocStore((s) => s.past);
  const future = useDocStore((s) => s.future);
  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const reset = useDocStore((s) => s.reset);

  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const goHome = useUiStore((s) => s.goHome);
  const showThumbRail = useUiStore((s) => s.showThumbRail);
  const toggleThumbRail = useUiStore((s) => s.toggleThumbRail);

  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);

  function handleHome() {
    if (pages.length > 0 && !window.confirm('Leave this document? Unsaved changes will be lost.')) return;
    reset();
    goHome();
  }

  async function handleSave() {
    if (pages.length === 0) return;
    setBusy(true);
    try {
      const bytes = await buildOutputPdf({ sources, pages, annotations, formValues });
      const outName = suggestOutputName(fileName, '');
      downloadBytes(bytes, outName);
      await saveRecentFile({
        id: nanoid(),
        name: outName,
        bytes,
        pageCount: pages.length,
        updatedAt: Date.now(),
      });
      toast.success('Saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not save this document');
    } finally {
      setBusy(false);
    }
  }

  const showViewerChrome = mode === 'view' || mode === 'annotate' || mode === 'fillsign';

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={handleHome} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Home">
          <Home size={18} />
        </button>

        {editingName ? (
          <input
            autoFocus
            defaultValue={fileName}
            onBlur={(e) => {
              setFileName(e.target.value || 'Untitled');
              setEditingName(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="max-w-[220px] rounded border border-indigo-400 bg-white px-2 py-1 text-sm outline-none dark:bg-neutral-800"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="max-w-[220px] truncate rounded px-2 py-1 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Rename"
          >
            {fileName}
          </button>
        )}

        <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />

        <button onClick={undo} disabled={past.length === 0} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800" title="Undo">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={future.length === 0} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800" title="Redo">
          <Redo2 size={16} />
        </button>

        {showViewerChrome && (
          <>
            <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
            <button onClick={toggleThumbRail} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Toggle thumbnails">
              {showThumbRail ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <button onClick={() => setZoom(zoom - 0.1)} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Zoom out">
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center text-xs tabular-nums text-neutral-500">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(zoom + 0.1)} className="rounded-md p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Zoom in">
              <ZoomIn size={16} />
            </button>
          </>
        )}

        <nav className="mx-auto flex items-center gap-0.5 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  mode === m.id ? 'bg-white text-indigo-700 shadow-sm dark:bg-neutral-700 dark:text-indigo-300' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={handleSave}
          disabled={busy || pages.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Save
        </button>
      </header>

      {mode === 'annotate' && <AnnotatePanel />}
      {mode === 'fillsign' && <FillSignPanel />}

      <div className="flex flex-1 overflow-hidden">
        {showViewerChrome && showThumbRail && <ThumbRail />}
        {mode === 'organize' && <OrganizeGrid />}
        {mode === 'pagetools' && <PageToolsPanel />}
        {mode === 'protect' && <ProtectPanel />}
        {showViewerChrome && (
          <main className="flex-1 overflow-y-auto bg-neutral-200 dark:bg-neutral-950">
            <PageList />
          </main>
        )}
      </div>
    </div>
  );
}
