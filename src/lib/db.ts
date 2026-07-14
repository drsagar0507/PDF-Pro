import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RecentFile, SavedSignature } from './types';

interface PdfProDB extends DBSchema {
  recentFiles: {
    key: string;
    value: RecentFile;
    indexes: { updatedAt: number };
  };
  signatures: {
    key: string;
    value: SavedSignature;
  };
}

let dbPromise: Promise<IDBPDatabase<PdfProDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<PdfProDB>('pdf-pro', 1, {
      upgrade(db) {
        const recents = db.createObjectStore('recentFiles', { keyPath: 'id' });
        recents.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('signatures', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

const MAX_RECENTS = 12;

export async function saveRecentFile(file: RecentFile): Promise<void> {
  const db = await getDb();
  await db.put('recentFiles', file);
  const all = await db.getAllFromIndex('recentFiles', 'updatedAt');
  if (all.length > MAX_RECENTS) {
    const toRemove = all
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .slice(0, all.length - MAX_RECENTS);
    const tx = db.transaction('recentFiles', 'readwrite');
    await Promise.all(toRemove.map((f) => tx.store.delete(f.id)));
    await tx.done;
  }
}

export async function listRecentFiles(): Promise<RecentFile[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('recentFiles', 'updatedAt');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteRecentFile(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('recentFiles', id);
}

export async function clearRecentFiles(): Promise<void> {
  const db = await getDb();
  await db.clear('recentFiles');
}

export async function saveSignature(sig: SavedSignature): Promise<void> {
  const db = await getDb();
  await db.put('signatures', sig);
}

export async function listSignatures(): Promise<SavedSignature[]> {
  const db = await getDb();
  const all = await db.getAll('signatures');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSignature(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('signatures', id);
}
