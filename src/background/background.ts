import {
  deleteDocument,
  listDocuments,
  putChunks,
  putDocument,
  type RagChunk,
  type RagDocument,
  getChunksForDocs,
} from "./ragDb";
import { cosineDot, toNormalizedF32 } from "./ragMath";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";

// MV3 background service worker
//
// With no `action.default_popup`, clicking the extension icon triggers this handler.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => resolve(result));
  });
}

type StoredPrompt = {
  id: string;
  model: string;
  template: string;
  secretMode: boolean;
  commandId?: string;
};

function normalizeStoredPrompt(value: unknown): StoredPrompt | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.model !== "string" ||
    typeof v.template !== "string" ||
    typeof v.secretMode !== "boolean"
  ) {
    return null;
  }
  return {
    id: v.id,
    model: v.model,
    template: v.template,
    secretMode: v.secretMode,
    commandId: typeof v.commandId === "string" ? v.commandId : undefined,
  };
}

async function injectAndRunPrompt(command: string) {
  const { openRouterApiKey, prompts } = await storageGet([
    "openRouterApiKey",
    "prompts",
  ]);

  const apiKey = typeof openRouterApiKey === "string" ? openRouterApiKey : "";
  const promptList: StoredPrompt[] = Array.isArray(prompts)
    ? (prompts as unknown[])
        .map(normalizeStoredPrompt)
        .filter((p): p is StoredPrompt => p !== null)
    : [];

  const prompt = promptList.find((p) => p.commandId === command);
  if (!prompt) {
    chrome.runtime.openOptionsPage();
    return;
  }

  const tabs = await new Promise<Array<{ id?: number }>>((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );
  const tabId = tabs[0]?.id;
  if (!tabId) return;

  const sendTabMessage = (message: unknown) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      chrome.tabs.sendMessage(tabId, message, () => {
        const err = (chrome.runtime as any).lastError as
          | { message?: string }
          | undefined;
        if (err) {
          resolve({
            ok: false,
            error: err.message || "tabs.sendMessage failed",
          });
        } else {
          resolve({ ok: true });
        }
      });
    });

  // If already injected, don't re-inject (re-injection can load a second React copy and break hooks).
  const ping = await sendTabMessage({ type: "BROWSE_ASSIST_PING" });
  if (!ping.ok) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["js/content.js"],
    });
  }

  // Send prompt to the injected UI. Retry briefly in case the script is still initializing.
  const msg = { type: "RUN_PROMPT", apiKey, prompt };
  await sendTabMessage(msg);
  setTimeout(() => void sendTabMessage(msg), 150);
}

chrome.commands.onCommand.addListener((command) => {
  injectAndRunPrompt(command);
});

type OpenRouterChatRequest = {
  type: "OPENROUTER_CHAT";
  apiKey: string;
  model: string;
  prompt: string;
};

type OpenRouterChatResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

type RagIndexRequest = {
  type: "RAG_INDEX_DOCUMENT";
  apiKey: string;
  doc: {
    id: string;
    name: string;
    pageCount: number;
    byteSize: number;
    sha256?: string;
  };
  chunks: Array<{
    id: string;
    pageStart: number;
    pageEnd: number;
    text: string;
  }>;
};

type RagIndexResponse =
  | { ok: true; docId: string; chunkCount: number }
  | { ok: false; error: string };

type RagListDocsRequest = { type: "RAG_LIST_DOCUMENTS" };
type RagListDocsResponse =
  | { ok: true; documents: RagDocument[] }
  | { ok: false; error: string };

type RagDeleteDocRequest = { type: "RAG_DELETE_DOCUMENT"; docId: string };
type RagDeleteDocResponse = { ok: true } | { ok: false; error: string };

type RagSearchRequest = {
  type: "RAG_SEARCH";
  apiKey: string;
  query: string;
  topK: number;
  docIds?: string[];
};

type RagSearchHit = {
  docId: string;
  docName?: string;
  chunkId: string;
  score: number;
  pageStart: number;
  pageEnd: number;
  text: string;
};

type RagSearchResponse =
  | { ok: true; hits: RagSearchHit[] }
  | { ok: false; error: string };

type AnyRequest =
  | OpenRouterChatRequest
  | RagIndexRequest
  | RagListDocsRequest
  | RagDeleteDocRequest
  | RagSearchRequest;

async function openRouterEmbeddings(
  apiKey: string,
  inputs: string[]
): Promise<number[][]> {
  const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Lumpy",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Embeddings HTTP ${resp.status}${text ? `: ${text}` : ""}`);
  }

  const json = (await resp.json()) as any;
  const data = json?.data;
  if (!Array.isArray(data))
    throw new Error("Embeddings response missing data[]");

  const out: number[][] = [];
  for (const item of data) {
    const emb = item?.embedding;
    if (!Array.isArray(emb))
      throw new Error("Embeddings item missing embedding[]");
    out.push(emb as number[]);
  }
  return out;
}

async function openRouterChat(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Lumpy",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `OpenRouter error HTTP ${resp.status}${text ? `: ${text}` : ""}`
    );
  }

  const json = (await resp.json()) as any;
  const content =
    json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? "";
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("No content in OpenRouter response");
  }
  return content;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as Partial<AnyRequest> | null;
  if (!msg || typeof msg.type !== "string") return;

  (async () => {
    switch (msg.type) {
      case "OPENROUTER_CHAT": {
        const m = msg as OpenRouterChatRequest;
        if (!m.apiKey || !m.model || !m.prompt) {
          return {
            ok: false,
            error: "Missing apiKey/model/prompt",
          } satisfies OpenRouterChatResponse;
        }
        const text = await openRouterChat(m.apiKey, m.model, m.prompt);
        return { ok: true, text } satisfies OpenRouterChatResponse;
      }

      case "RAG_LIST_DOCUMENTS": {
        const documents = await listDocuments();
        documents.sort((a, b) => b.createdAt - a.createdAt);
        return { ok: true, documents } satisfies RagListDocsResponse;
      }

      case "RAG_DELETE_DOCUMENT": {
        const m = msg as RagDeleteDocRequest;
        if (!m.docId)
          return {
            ok: false,
            error: "Missing docId",
          } satisfies RagDeleteDocResponse;
        await deleteDocument(m.docId);
        return { ok: true } satisfies RagDeleteDocResponse;
      }

      case "RAG_INDEX_DOCUMENT": {
        const m = msg as RagIndexRequest;
        if (!m.apiKey)
          return {
            ok: false,
            error: "Missing apiKey",
          } satisfies RagIndexResponse;
        if (!m.doc?.id || !m.doc?.name)
          return { ok: false, error: "Missing doc" } satisfies RagIndexResponse;
        if (!Array.isArray(m.chunks) || m.chunks.length === 0) {
          return { ok: false, error: "No chunks" } satisfies RagIndexResponse;
        }

        // Embed in batches to reduce latency and cost.
        const BATCH = 32;
        const chunkRecords: RagChunk[] = [];
        for (let i = 0; i < m.chunks.length; i += BATCH) {
          const batch = m.chunks.slice(i, i + BATCH);
          const embeddings = await openRouterEmbeddings(
            m.apiKey,
            batch.map((c) => c.text)
          );

          for (let j = 0; j < batch.length; j++) {
            const c = batch[j];
            const emb = embeddings[j];
            const f32 = toNormalizedF32(emb);
            chunkRecords.push({
              id: c.id,
              docId: m.doc.id,
              createdAt: Date.now(),
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
              text: c.text,
              embeddingF32: f32.buffer,
            });
          }
        }

        const docRecord: RagDocument = {
          id: m.doc.id,
          name: m.doc.name,
          createdAt: Date.now(),
          pageCount: m.doc.pageCount,
          byteSize: m.doc.byteSize,
          sha256: m.doc.sha256,
          embeddingModel: EMBEDDING_MODEL,
          chunkCount: chunkRecords.length,
        };

        await putDocument(docRecord);
        await putChunks(chunkRecords);

        return {
          ok: true,
          docId: m.doc.id,
          chunkCount: chunkRecords.length,
        } satisfies RagIndexResponse;
      }

      case "RAG_SEARCH": {
        const m = msg as RagSearchRequest;
        if (!m.apiKey)
          return {
            ok: false,
            error: "Missing apiKey",
          } satisfies RagSearchResponse;
        if (!m.query?.trim())
          return {
            ok: false,
            error: "Missing query",
          } satisfies RagSearchResponse;
        const topK = Math.max(1, Math.min(20, Number(m.topK) || 6));

        const allDocs = await listDocuments();
        const docs =
          m.docIds && m.docIds.length ? m.docIds : allDocs.map((d) => d.id);
        if (docs.length === 0)
          return { ok: true, hits: [] } satisfies RagSearchResponse;
        const docNameById = new Map(
          allDocs.map((d) => [d.id, d.name] as const)
        );

        const [queryEmb] = await openRouterEmbeddings(m.apiKey, [m.query]);
        const q = toNormalizedF32(queryEmb);

        const chunks = await getChunksForDocs(docs);
        // Keep simple topK list (datasets are expected to be small/medium).
        const best: RagSearchHit[] = [];

        for (const c of chunks) {
          const v = new Float32Array(c.embeddingF32);
          const score = cosineDot(q, v);
          if (best.length < topK) {
            best.push({
              docId: c.docId,
              docName: docNameById.get(c.docId),
              chunkId: c.id,
              score,
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
              text: c.text,
            });
            best.sort((a, b) => b.score - a.score);
          } else if (score > best[best.length - 1].score) {
            best[best.length - 1] = {
              docId: c.docId,
              docName: docNameById.get(c.docId),
              chunkId: c.id,
              score,
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
              text: c.text,
            };
            best.sort((a, b) => b.score - a.score);
          }
        }

        return { ok: true, hits: best } satisfies RagSearchResponse;
      }

      default:
        return { ok: false, error: `Unknown message type: ${msg.type}` };
    }
  })()
    .then((res) => sendResponse(res))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    );

  return true;
});

export {};
