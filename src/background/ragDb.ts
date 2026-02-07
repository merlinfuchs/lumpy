import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type RagDocument = {
  id: string;
  name: string;
  createdAt: number;
  pageCount: number;
  byteSize: number;
  sha256?: string;
  embeddingModel: string;
  chunkCount: number;
};

export type RagChunk = {
  id: string;
  docId: string;
  createdAt: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  // Normalized Float32 embedding.
  embeddingF32: ArrayBufferLike;
};

interface RagDbSchema extends DBSchema {
  documents: {
    key: string;
    value: RagDocument;
  };
  chunks: {
    key: string;
    value: RagChunk;
    indexes: { byDocId: string };
  };
}

let dbPromise: Promise<IDBPDatabase<RagDbSchema>> | null = null;

export function getRagDb(): Promise<IDBPDatabase<RagDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<RagDbSchema>("browseAssistRag", 1, {
      upgrade(db) {
        const docs = db.createObjectStore("documents", { keyPath: "id" });
        void docs;

        const chunks = db.createObjectStore("chunks", { keyPath: "id" });
        chunks.createIndex("byDocId", "docId");
      },
    });
  }
  return dbPromise;
}

export async function listDocuments(): Promise<RagDocument[]> {
  const db = await getRagDb();
  return await db.getAll("documents");
}

export async function putDocument(doc: RagDocument): Promise<void> {
  const db = await getRagDb();
  await db.put("documents", doc);
}

export async function deleteDocument(docId: string): Promise<void> {
  const db = await getRagDb();
  const tx = db.transaction(["documents", "chunks"], "readwrite");
  await tx.objectStore("documents").delete(docId);

  const idx = tx.objectStore("chunks").index("byDocId");
  for await (const cursor of idx.iterate(IDBKeyRange.only(docId))) {
    await cursor.delete();
  }
  await tx.done;
}

export async function putChunks(chunks: RagChunk[]): Promise<void> {
  const db = await getRagDb();
  const tx = db.transaction("chunks", "readwrite");
  for (const c of chunks) {
    await tx.store.put(c);
  }
  await tx.done;
}

export async function getChunksForDocs(docIds: string[]): Promise<RagChunk[]> {
  const db = await getRagDb();
  if (docIds.length === 0) return [];
  const out: RagChunk[] = [];
  const tx = db.transaction("chunks", "readonly");
  const idx = tx.store.index("byDocId");
  for (const docId of docIds) {
    for await (const cursor of idx.iterate(IDBKeyRange.only(docId))) {
      out.push(cursor.value);
    }
  }
  await tx.done;
  return out;
}

