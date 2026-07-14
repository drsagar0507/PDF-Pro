import {
  MousePointer2,
  Highlighter,
  Pencil,
  Type,
  StickyNote,
  Eraser,
} from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import type { AnnotateTool } from '../../lib/types';

const TOOLS: { id: AnnotateTool; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'highlight', icon: Highlighter, label: 'Highlight' },
  { id: 'ink', icon: Pencil, label: 'Draw' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'note', icon: StickyNote, label: 'Note' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
];

const COLORS = ['#FFD54A', '#FF7A59', '#4ADE80', '#60A5FA', '#C084FC', '#111827'];

export default function AnnotatePanel() {
  const tool = useUiStore((s) => s.annotateTool);
  const setTool = useUiStore((s) => s.setAnnotateTool);
  const color = useUiStore((s) => s.annotateColor);
  const setColor = useUiStore((s) => s.setAnnotateColor);

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
      <div className="flex flex-none items-center gap-2 pr-2">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`h-6 w-6 flex-none rounded-full border-2 transition ${color === c ? 'border-indigo-500 scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
