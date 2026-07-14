import { useRef, useState } from 'react';
import {
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Download,
  CheckSquare,
  Square,
  Scissors,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDocStore } from '../../store/useDocStore';
import PageThumb from '../viewer/PageThumb';
import { buildOutputPdf } from '../../lib/exportPdf';
import { downloadBytes, suggestOutputName } from '../../lib/fileIO';
import { saveRecentFile } from '../../lib/db';
import { nanoid } from 'nanoid';

export default function OrganizeGrid() {
  const pages = useDocStore((s) => s.pages);
  const sources = useDocStore((s) => s.sources);
  const annotations = useDocStore((s) => s.annotations);
  const formValues = useDocStore((s) => s.formValues);
  const fileName = useDocStore((s) => s.fileName);
  const selectedPageIds = useDocStore((s) => s.selectedPageIds);
  const toggleSelected = useDocStore((s) => s.toggleSelected);
  const clearSelection = useDocStore((s) => s.clearSelection);
  const selectAll = useDocStore((s) => s.selectAll);
  const reorderPages = useDocStore((s) => s.reorderPages);
  const rotatePages = useDocStore((s) => s.rotatePages);
  const deletePages = useDocStore((s) => s.deletePages);
  const addFiles = useDocStore((s) => s.addFiles);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSelection = selectedPageIds.length > 0;

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...pages];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    reorderPages(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  async function extractSelected() {
    if (selectedPageIds.length === 0) return;
    setBusy(true);
    try {
      const bytes = await buildOutputPdf(
        { sources, pages, annotations, formValues },
        { pageIds: selectedPageIds },
      );
      downloadBytes(bytes, suggestOutputName(fileName, '-extracted'));
      toast.success(`Extracted ${selectedPageIds.length} page${selectedPageIds.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error(err);
      toast.error('Could not extract pages');
    } finally {
      setBusy(false);
    }
  }

  async function splitEachSelectedAsOwnFile() {
    if (selectedPageIds.length === 0) return;
    setBusy(true);
    try {
      for (let i = 0; i < selectedPageIds.length; i++) {
        const bytes = await buildOutputPdf(
          { sources, pages, annotations, formValues },
          { pageIds: [selectedPageIds[i]] },
        );
        downloadBytes(bytes, suggestOutputName(fileName, `-page-${i + 1}`));
      }
      toast.success('Pages split into separate files');
    } catch (err) {
      console.error(err);
      toast.error('Could not split pages');
    } finally {
      setBusy(false);
    }
  }

  async function saveWholeDocument() {
    setBusy(true);
    try {
      const bytes = await buildOutputPdf({ sources, pages, annotations, formValues });
      downloadBytes(bytes, suggestOutputName(fileName, '-organized'));
      await saveRecentFile({
        id: nanoid(),
        name: suggestOutputName(fileName, '-organized'),
        bytes,
        pageCount: pages.length,
        updatedAt: Date.now(),
      });
      toast.success('Saved');
    } catch (err) {
      console.error(err);
      toast.error('Could not save document');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf,image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
        <ToolbarButton icon={Plus} label="Add files" onClick={() => fileInputRef.current?.click()} />
        <div className="mx-1 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
        <ToolbarButton
          icon={hasSelection ? CheckSquare : Square}
          label={hasSelection ? `${selectedPageIds.length} selected` : 'Select all'}
          onClick={() => (hasSelection ? clearSelection() : selectAll())}
        />
        <ToolbarButton icon={RotateCcw} label="Rotate left" disabled={!hasSelection} onClick={() => rotatePages(selectedPageIds, -90)} />
        <ToolbarButton icon={RotateCw} label="Rotate right" disabled={!hasSelection} onClick={() => rotatePages(selectedPageIds, 90)} />
        <ToolbarButton
          icon={Trash2}
          label="Delete"
          disabled={!hasSelection}
          onClick={() => {
            deletePages(selectedPageIds);
          }}
        />
        <ToolbarButton icon={Download} label="Extract selected" disabled={!hasSelection || busy} onClick={extractSelected} />
        <ToolbarButton icon={Scissors} label="Split into files" disabled={!hasSelection || busy} onClick={splitEachSelectedAsOwnFile} />
        <div className="ml-auto">
          <button
            onClick={saveWholeDocument}
            disabled={busy || pages.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            Save document
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {pages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
            Add files to get started
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {pages.map((page, i) => {
              const selected = selectedPageIds.includes(page.id);
              return (
                <div
                  key={page.id}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverIndex(i);
                  }}
                  onDrop={() => handleDrop(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`group relative cursor-grab rounded-lg border-2 p-1.5 transition active:cursor-grabbing ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : overIndex === i
                        ? 'border-indigo-300 border-dashed'
                        : 'border-transparent hover:border-neutral-300 dark:hover:border-neutral-700'
                  }`}
                >
                  <div
                    className="mx-auto flex items-center justify-center overflow-hidden rounded border border-neutral-200 shadow-sm dark:border-neutral-700"
                    onClick={() => toggleSelected(page.id)}
                  >
                    <PageThumb page={page} targetWidth={150} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between px-0.5">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{i + 1}</span>
                    <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button
                        title="Rotate left"
                        onClick={() => rotatePages([page.id], -90)}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <RotateCcw size={13} />
                      </button>
                      <button
                        title="Rotate right"
                        onClick={() => rotatePages([page.id], 90)}
                        className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <RotateCw size={13} />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => deletePages([page.id])}
                        className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleSelected(page.id)}
                    className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border-2 bg-white/90 transition dark:bg-neutral-900/90 ${
                      selected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-neutral-300 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {selected && <CheckSquare size={12} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
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
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
