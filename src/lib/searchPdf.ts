import type { PageRef, SourceDoc } from './types';
import { getPdfjsDoc } from './docCache';

export interface SearchMatch {
  pageId: string;
  pageNumber: number;
  snippet: string;
  rectNative: { x0: number; y0: number; x1: number; y1: number };
}

interface PdfjsTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

const MAX_MATCHES = 200;

export async function searchDocument(
  pages: PageRef[],
  sources: Record<string, SourceDoc>,
  query: string,
): Promise<SearchMatch[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: SearchMatch[] = [];

  for (let pageNumber = 1; pageNumber <= pages.length; pageNumber++) {
    if (matches.length >= MAX_MATCHES) break;
    const ref = pages[pageNumber - 1];
    const source = sources[ref.sourceId];
    if (!source || source.kind !== 'pdf') continue;

    try {
      const doc = await getPdfjsDoc(source.id, source.bytes);
      const pdfjsPage = await doc.getPage(ref.pageIndex + 1);
      const content = await pdfjsPage.getTextContent();
      const items = content.items as PdfjsTextItem[];

      for (const item of items) {
        if (!item.str) continue;
        const idx = item.str.toLowerCase().indexOf(q);
        if (idx === -1) continue;

        const originX = item.transform[4];
        const originY = item.transform[5];
        const height = item.height || Math.abs(item.transform[3]) || 10;
        const width = item.width || 10;

        const before = item.str.slice(Math.max(0, idx - 30), idx);
        const after = item.str.slice(idx + q.length, idx + q.length + 30);
        const snippet = `${idx > 30 ? '…' : ''}${before}${item.str.slice(idx, idx + q.length)}${after}${
          idx + q.length + 30 < item.str.length ? '…' : ''
        }`;

        matches.push({
          pageId: ref.id,
          pageNumber,
          snippet,
          rectNative: {
            x0: originX,
            y0: originY - height * 0.25,
            x1: originX + width,
            y1: originY + height * 0.95,
          },
        });

        if (matches.length >= MAX_MATCHES) break;
      }
    } catch {
      // unreadable page text (e.g. scanned image with no text layer) — skip
    }
  }

  return matches;
}
