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
  MoreVertical,
  ScanLine,
  Search,
  Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { nanoid } from 'nanoid';
import { useDocStore } from '../store/useDocStore';
import { useUiStore } from '../store/useUiStore';
import type { EditorMode } from '../lib/types';
import PageList from '../components/viewer/PageList';
import ThumbRail from '../components/viewer/ThumbRail';
import MobilePageSheet from '../components/viewer/MobilePageSheet';
import SearchBar from '../components/viewer/SearchBar';
import OrganizeGrid from '../components/organize/OrganizeGrid';
import AnnotatePanel from '../components/panels/AnnotatePanel';
import FillSignPanel from '../components/panels/FillSignPanel';
import PageToolsPanel from '../components/panels/PageToolsPanel';
import ProtectPanel from '../components/panels/ProtectPanel';
import ScannerModal from '../components/scanner/ScannerModal';
import { buildOutputPdf } from '../lib/exportPdf';
import { asBufferSource, downloadBytes, suggestOutputName } from '../lib/fileIO';
import { saveRecentFile } from '../lib/db';
import { renderThumbnailDataUrl } from '../lib/thumbnail';

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
  const addFiles = useDocStore((s) => s.addFiles);

  const zoom = useUiStore((s) => s.zoom);
  const setZoom = useUiStore((s) => s.setZoom);
  const goHome = useUiStore((s) => s.goHome);
  const showThumbRail = useUiStore((s) => s.showThumbRail);
  const toggleThumbRail = useUiStore((s) => s.toggleThumbRail);

  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobilePagesOpen, setMobilePagesOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
      const thumbnailDataUrl = await renderThumbnailDataUrl(bytes);
      await saveRecentFile({
        id: nanoid(),
        name: outName,
        bytes,
        pageCount: pages.length,
        updatedAt: Date.now(),
        thumbnailDataUrl,
      });
      toast.success('Saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not save this document');
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (pages.length === 0) return;
    setPrinting(true);
    try {
      const bytes = await buildOutputPdf({ sources, pages, annotations, formValues });
      const blob = new Blob([asBufferSource(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error('Could not prepare document for printing');
    } finally {
      setPrinting(false);
    }
  }

  const showViewerChrome = mode === 'view' || mode === 'annotate' || mode === 'fillsign';

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-1 border-b border-neutral-200 bg-white px-2 py-2 sm:gap-2 sm:px-3 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={handleHome} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="Home">
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
            className="w-24 min-w-0 rounded border border-indigo-400 bg-white px-2 py-1 text-sm outline-none sm:w-auto sm:max-w-[220px] dark:bg-neutral-800"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm font-medium hover:bg-neutral-100 sm:max-w-[220px] sm:flex-none dark:hover:bg-neutral-800"
            title="Rename"
          >
            {fileName}
          </button>
        )}

        {/* Desktop-only controls */}
        <div className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block dark:bg-neutral-700" />
        <button onClick={undo} disabled={past.length === 0} className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 sm:block dark:hover:bg-neutral-800" title="Undo">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={future.length === 0} className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 sm:block dark:hover:bg-neutral-800" title="Redo">
          <Redo2 size={16} />
        </button>
        {showViewerChrome && (
          <>
            <div className="mx-1 hidden h-5 w-px bg-neutral-200 sm:block dark:bg-neutral-700" />
            <button onClick={toggleThumbRail} className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 sm:block dark:hover:bg-neutral-800" title="Toggle thumbnails">
              {showThumbRail ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <button onClick={() => setZoom(zoom - 0.1)} className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 sm:block dark:hover:bg-neutral-800" title="Zoom out">
              <ZoomOut size={16} />
            </button>
            <span className="hidden w-12 text-center text-xs tabular-nums text-neutral-600 sm:inline-block">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(zoom + 0.1)} className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 sm:block dark:hover:bg-neutral-800" title="Zoom in">
              <ZoomIn size={16} />
            </button>
          </>
        )}

        {/* Desktop mode nav */}
        <nav className="mx-auto hidden items-center gap-0.5 rounded-lg bg-neutral-100 p-1 sm:flex dark:bg-neutral-800">
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-95 ${
                  mode === m.id ? 'bg-white text-indigo-700 shadow-sm dark:bg-neutral-700 dark:text-indigo-300' : 'text-neutral-600 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
              >
                <Icon size={14} />
                {m.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          {showViewerChrome && (
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={`rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${searchOpen ? 'text-indigo-600' : 'text-neutral-600'}`}
              title="Search"
            >
              <Search size={18} />
            </button>
          )}
          <button
            onClick={handlePrint}
            disabled={printing || pages.length === 0}
            className="hidden rounded-md p-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 sm:block dark:hover:bg-neutral-800"
            title="Print"
          >
            {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
          </button>
          <button
            onClick={() => setScannerOpen(true)}
            className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Scan a document"
          >
            <ScanLine size={18} />
          </button>

          {/* Mobile-only overflow menu for undo/redo/zoom/thumbnails */}
          <div className="relative sm:hidden">
            <button onClick={() => setMoreOpen((v) => !v)} className="rounded-md p-2 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800" title="More">
              <MoreVertical size={18} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
                  <MenuRow icon={Undo2} label="Undo" onClick={undo} disabled={past.length === 0} />
                  <MenuRow icon={Redo2} label="Redo" onClick={redo} disabled={future.length === 0} />
                  <MenuRow icon={Printer} label="Print" onClick={handlePrint} disabled={pages.length === 0} />
                  {showViewerChrome && (
                    <>
                      <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />
                      <MenuRow icon={ZoomOut} label="Zoom out" onClick={() => setZoom(zoom - 0.1)} />
                      <MenuRow icon={ZoomIn} label="Zoom in" onClick={() => setZoom(zoom + 0.1)} />
                      <MenuRow
                        icon={showThumbRail ? PanelLeftClose : PanelLeftOpen}
                        label={showThumbRail ? 'Hide thumbnails' : 'Show thumbnails'}
                        onClick={toggleThumbRail}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={busy || pages.length === 0}
            aria-label="Save"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 sm:px-3.5"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </header>

      {searchOpen && showViewerChrome && <SearchBar onClose={() => setSearchOpen(false)} />}
      {mode === 'annotate' && <AnnotatePanel />}
      {mode === 'fillsign' && <FillSignPanel />}

      <main className="flex flex-1 overflow-hidden pb-14 sm:pb-0">
        <h1 className="sr-only">{fileName} — PDF Pro editor</h1>
        {showViewerChrome && showThumbRail && <ThumbRail />}
        {mode === 'organize' && (
          <div key="organize" className="animate-fade-in flex min-w-0 flex-1">
            <OrganizeGrid />
          </div>
        )}
        {mode === 'pagetools' && (
          <div key="pagetools" className="animate-fade-in flex min-w-0 flex-1">
            <PageToolsPanel />
          </div>
        )}
        {mode === 'protect' && (
          <div key="protect" className="animate-fade-in flex min-w-0 flex-1">
            <ProtectPanel />
          </div>
        )}
        {showViewerChrome && (
          <div
            className="min-w-0 flex-1 overflow-y-auto bg-neutral-200 dark:bg-neutral-950"
            tabIndex={0}
            role="region"
            aria-label="Document pages"
          >
            <PageList />
          </div>
        )}
      </main>

      {/* Mobile bottom tab bar for mode switching */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-neutral-200 bg-white sm:hidden dark:border-neutral-800 dark:bg-neutral-900"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                mode === m.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              <Icon size={19} />
              {m.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile floating page indicator / navigator, only in viewer modes */}
      {showViewerChrome && pages.length > 0 && (
        <button
          onClick={() => setMobilePagesOpen(true)}
          className="fixed bottom-16 right-3 z-20 flex items-center gap-1 rounded-full bg-neutral-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg sm:hidden"
        >
          <LayoutGrid size={13} />
          {pages.length} page{pages.length === 1 ? '' : 's'}
        </button>
      )}
      {mobilePagesOpen && <MobilePageSheet onClose={() => setMobilePagesOpen(false)} />}

      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onDone={async (files) => {
            setScannerOpen(false);
            await addFiles(files);
            toast.success(`Added ${files.length} scanned page${files.length === 1 ? '' : 's'}`);
          }}
        />
      )}
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-700"
    >
      <Icon size={15} />
      {label}
    </button>
  );
}
