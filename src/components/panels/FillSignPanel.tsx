import { useEffect, useState } from 'react';
import {
  MousePointer2,
  Type,
  PenTool,
  Calendar,
  Check,
  X as XIcon,
  Circle,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useDocStore } from '../../store/useDocStore';
import type { FillSignTool } from '../../lib/types';
import SignatureModal from '../signature/SignatureModal';

const TOOLS: { id: FillSignTool; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'text', icon: Type, label: 'Add text' },
  { id: 'date', icon: Calendar, label: 'Date' },
  { id: 'checkmark', icon: Check, label: 'Check' },
  { id: 'xmark', icon: XIcon, label: 'X' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'line', icon: Minus, label: 'Line' },
];

export default function FillSignPanel() {
  const tool = useUiStore((s) => s.fillSignTool);
  const setTool = useUiStore((s) => s.setFillSignTool);
  const activeSignatureId = useUiStore((s) => s.activeSignatureId);
  const setActiveSignature = useUiStore((s) => s.setActiveSignature);

  const signatures = useDocStore((s) => s.signatures);
  const loadSignatures = useDocStore((s) => s.loadSignatures);
  const addSignature = useDocStore((s) => s.addSignature);
  const removeSignature = useDocStore((s) => s.removeSignature);

  const [modalKind, setModalKind] = useState<'signature' | 'initials' | null>(null);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  function selectSignature(dataUrl: string, id: string, kind: 'signature' | 'initials') {
    setActiveSignature(dataUrl, id);
    setTool(kind);
  }

  async function handleConfirm(dataUrl: string, save: boolean, name: string) {
    const kind = modalKind!;
    if (save) {
      await addSignature({ name, kind, dataUrl });
    }
    setActiveSignature(dataUrl, save ? null : `temp-${Date.now()}`);
    setTool(kind);
    setModalKind(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 bg-white px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 sm:py-2 dark:border-neutral-800 dark:bg-neutral-900 [&::-webkit-scrollbar]:hidden">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            title={t.label}
            onClick={() => setTool(t.id)}
            className={`flex flex-none items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition sm:py-1.5 ${
              tool === t.id
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <Icon size={15} />
            {t.label}
          </button>
        );
      })}

      <div className="mx-2 h-5 w-px flex-none bg-neutral-200 dark:bg-neutral-700" />

      <div className="flex flex-none items-center gap-1.5 pr-2">
        {signatures.map((sig) => (
          <div key={sig.id} className="group relative flex-none">
            <button
              title={sig.name}
              onClick={() => selectSignature(sig.dataUrl, sig.id, sig.kind)}
              className={`flex h-9 w-16 items-center justify-center rounded-md border bg-white p-1 dark:bg-neutral-800 ${
                activeSignatureId === sig.id ? 'border-indigo-500' : 'border-neutral-300 dark:border-neutral-700'
              }`}
            >
              <img src={sig.dataUrl} alt={sig.name} className="max-h-full max-w-full object-contain" />
            </button>
            <button
              onClick={() => removeSignature(sig.id)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-80 sm:h-4 sm:w-4 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={() => setModalKind('signature')}
          className="flex h-9 flex-none items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2.5 text-xs text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-neutral-700"
        >
          <PenTool size={13} /> Signature
        </button>
        <button
          onClick={() => setModalKind('initials')}
          className="flex h-9 flex-none items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2.5 text-xs text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 dark:border-neutral-700"
        >
          <Plus size={13} /> Initials
        </button>
      </div>

      {modalKind && (
        <SignatureModal kind={modalKind} onClose={() => setModalKind(null)} onConfirm={handleConfirm} />
      )}
    </div>
  );
}
