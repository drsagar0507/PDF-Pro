import { useEffect, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useUiStore } from '../../store/useUiStore';
import { searchDocument, type SearchMatch } from '../../lib/searchPdf';

interface Props {
  onClose: () => void;
}

export default function SearchBar({ onClose }: Props) {
  const pages = useDocStore((s) => s.pages);
  const sources = useDocStore((s) => s.sources);
  const flashSearchHighlight = useUiStore((s) => s.flashSearchHighlight);

  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches([]);
      setActiveIndex(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const results = await searchDocument(pages, sources, q);
      if (!cancelled) {
        setMatches(results);
        setActiveIndex(0);
        setLoading(false);
        if (results.length > 0) goTo(results[0]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pages, sources]);

  function goTo(match: SearchMatch) {
    const el = document.querySelector(`[data-page-number="${match.pageNumber}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashSearchHighlight(match.pageId, match.rectNative);
  }

  function step(delta: number) {
    if (matches.length === 0) return;
    const next = ((activeIndex + delta) % matches.length + matches.length) % matches.length;
    setActiveIndex(next);
    goTo(matches[next]);
  }

  return (
    <div
      role="search"
      aria-label="Search in document"
      className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 sm:px-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <Search size={16} className="flex-none text-neutral-400" />
      <input
        ref={inputRef}
        aria-label="Search text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') step(e.shiftKey ? -1 : 1);
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Search in document…"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
      />
      {loading && <Loader2 size={14} className="flex-none animate-spin text-neutral-400" />}
      {!loading && query.trim() && (
        <span className="flex-none text-xs tabular-nums text-neutral-600">
          {matches.length === 0 ? '0 results' : `${activeIndex + 1} of ${matches.length}`}
        </span>
      )}
      <button
        onClick={() => step(-1)}
        disabled={matches.length === 0}
        aria-label="Previous match"
        title="Previous match"
        className="flex-none rounded p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
      >
        <ChevronUp size={16} />
      </button>
      <button
        onClick={() => step(1)}
        disabled={matches.length === 0}
        aria-label="Next match"
        title="Next match"
        className="flex-none rounded p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-neutral-800"
      >
        <ChevronDown size={16} />
      </button>
      <button
        onClick={onClose}
        aria-label="Close search"
        title="Close search"
        className="flex-none rounded p-1.5 text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      >
        <X size={16} />
      </button>
    </div>
  );
}
