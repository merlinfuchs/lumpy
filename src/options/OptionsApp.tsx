import React, { useEffect, useMemo, useState } from "react";
import { OpenRouter } from "@openrouter/sdk";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PromptConfig {
  id: string;
  model: string;
  template: string;
  // Compatibility mode: use standard browser popups (alert, prompt) instead of custom one
  compatMode: boolean;
  // Whether to always prompt for additional input or only use selected text and fallback to prompt when no text is selected
  promptMode: "prompt" | "select";
  // Whether to show the answer in a popup, copy to clipboard, or both
  answerMode: "popup" | "clipboard" | "popup-clipboard";
  // Command slot this prompt is bound to (e.g. "run-prompt-1")
  commandId?: string;
  // Legacy: previously used for on-page key listeners; no longer used.
  keyboardShortcut?: string;
}

export interface ExtensionSettingsV2 {
  openRouterApiKey: string;
  prompts: PromptConfig[];
}

const STORAGE_KEYS = ["openRouterApiKey", "prompts"] as const;

const DEFAULT_SETTINGS: ExtensionSettingsV2 = {
  openRouterApiKey: "",
  prompts: [
    {
      id: "default",
      model: "openai/gpt-4o-mini",
      template:
        "You are Lumpy.\n\n" +
        "Goal: help the user understand whatever question or input they provide.\n" +
        "Be short, concise, correct, and cite key details from any context given to you.\n\n" +
        "User input:\n{{input}}\n\n" +
        "Response:",
      compatMode: false,
      promptMode: "prompt",
      answerMode: "popup",
      commandId: "run-prompt-1",
    },
  ],
};

const TEMPLATE_PLACEHOLDER = "{{input}}";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  description?: string;
};

type RagDocument = {
  id: string;
  name: string;
  createdAt: number;
  pageCount: number;
  byteSize: number;
  embeddingModel: string;
  chunkCount: number;
};

type RagListDocsResponse =
  | { ok: true; documents: RagDocument[] }
  | { ok: false; error: string };

type RagDeleteDocResponse = { ok: true } | { ok: false; error: string };

type RagIndexResponse =
  | { ok: true; docId: string; chunkCount: number }
  | { ok: false; error: string };

function sendMessage<TResponse>(message: unknown): Promise<TResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) =>
      resolve(response as TResponse)
    );
  });
}

function bytesToHex(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < u8.length; i++)
    out += u8[i].toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}

type PageText = { page: number; text: string };

async function extractPdfText(
  file: File
): Promise<{ pages: PageText[]; pageCount: number }> {
  // Configure pdf.js worker to the file we copy into dist/js/.
  (pdfjs as any).GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "js/pdf.worker.min.mjs"
  );

  const buf = await file.arrayBuffer();
  const loadingTask = (pdfjs as any).getDocument({ data: new Uint8Array(buf) });
  const pdf = await loadingTask.promise;
  const pageCount: number = pdf.numPages;

  const pages: PageText[] = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = (tc.items as any[])
      .map((it) => (typeof it?.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: p, text });
  }

  return { pages, pageCount };
}

function chunkPages(
  pages: PageText[],
  opts?: { maxChars?: number; overlapChars?: number }
): Array<{ pageStart: number; pageEnd: number; text: string }> {
  const maxChars = opts?.maxChars ?? 2500;
  const overlapChars = opts?.overlapChars ?? 250;
  const chunks: Array<{ pageStart: number; pageEnd: number; text: string }> =
    [];

  let cur = "";
  let pageStart = pages[0]?.page ?? 1;
  let pageEnd = pageStart;

  const push = () => {
    const t = cur.trim();
    if (!t) return;
    chunks.push({ pageStart, pageEnd, text: t });
  };

  for (const pg of pages) {
    const addition = pg.text
      ? `\n\n[Page ${pg.page}]\n${pg.text}`
      : `\n\n[Page ${pg.page}]`;
    if (cur.length + addition.length > maxChars && cur.trim().length > 0) {
      push();
      const overlap = cur.slice(Math.max(0, cur.length - overlapChars));
      cur = overlap;
      pageStart = pg.page;
    }
    cur += addition;
    pageEnd = pg.page;
  }
  push();
  return chunks;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

const PROMPT_MODES = ["prompt", "select"] as const;
const ANSWER_MODES = ["popup", "clipboard", "popup-clipboard"] as const;

function normalizePrompt(value: unknown): PromptConfig | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    typeof v.model !== "string" ||
    typeof v.template !== "string" ||
    typeof v.compatMode !== "boolean"
  ) {
    return null;
  }

  // Migrate legacy stealthMode to answerMode + promptMode
  let promptMode: "prompt" | "select" = "prompt";
  let answerMode: "popup" | "clipboard" | "popup-clipboard" = "popup";
  if (typeof v.answerMode === "string" && ANSWER_MODES.includes(v.answerMode as any)) {
    answerMode = v.answerMode as "popup" | "clipboard" | "popup-clipboard";
  } else if (v.stealthMode === true) {
    answerMode = "clipboard";
    promptMode = "select";
  }
  if (typeof v.promptMode === "string" && PROMPT_MODES.includes(v.promptMode as any)) {
    promptMode = v.promptMode as "prompt" | "select";
  }

  return {
    id: v.id,
    model: v.model,
    template: v.template,
    compatMode: v.compatMode,
    promptMode,
    answerMode,
    commandId: typeof v.commandId === "string" ? v.commandId : undefined,
    keyboardShortcut:
      typeof v.keyboardShortcut === "string" ? v.keyboardShortcut : undefined,
  };
}

function normalizeSettings(
  result: Record<string, unknown>
): ExtensionSettingsV2 {
  const openRouterApiKey =
    typeof result.openRouterApiKey === "string" ? result.openRouterApiKey : "";

  const promptsRaw = result.prompts;
  const prompts = Array.isArray(promptsRaw)
    ? promptsRaw
        .map(normalizePrompt)
        .filter((p): p is PromptConfig => p !== null)
    : [];

  return {
    openRouterApiKey,
    prompts: prompts.length ? prompts : DEFAULT_SETTINGS.prompts,
  };
}

export default function OptionsApp() {
  const logoUrl = useMemo(
    () => chrome.runtime.getURL("static/icon512.png"),
    []
  );

  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] =
    useState<ExtensionSettingsV2>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string>("");
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<number | null>(null);

  const [ragDocs, setRagDocs] = useState<RagDocument[]>([]);
  const [ragBusy, setRagBusy] = useState(false);
  const [ragError, setRagError] = useState("");
  const [ragStatus, setRagStatus] = useState("");

  const hasOpenRouterKey = settings.openRouterApiKey.trim().length > 0;

  useEffect(() => {
    chrome.storage.sync.get([...STORAGE_KEYS], (result) => {
      setSettings(normalizeSettings(result));
      setLoaded(true);
      setDirty(false);
    });
  }, []);

  const refreshRagDocs = async () => {
    setRagError("");
    const res = await sendMessage<RagListDocsResponse>({
      type: "RAG_LIST_DOCUMENTS",
    });
    if (!res.ok) {
      setRagError(res.error);
      setRagDocs([]);
      return;
    }
    setRagDocs(res.documents);
  };

  useEffect(() => {
    if (!loaded) return;
    void refreshRagDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const loadModels = async (apiKey: string) => {
    if (apiKey.trim().length === 0) {
      setModels([]);
      setModelsUpdatedAt(null);
      setModelsError("OpenRouter API key is required to load models.");
      return;
    }
    setModelsLoading(true);
    setModelsError("");
    try {
      const client = new OpenRouter({ apiKey });
      const res = await client.models.listForUser({
        bearer: apiKey,
      });

      const data: unknown =
        (res as any)?.data ?? (res as any)?.value?.data ?? (res as any)?.value;

      const parsed: OpenRouterModel[] = [];
      if (Array.isArray(data)) {
        for (const m of data as any[]) {
          if (!m || typeof m !== "object") continue;
          const v = m as Record<string, unknown>;
          if (typeof v.id !== "string") continue;
          parsed.push({
            id: v.id,
            name: typeof v.name === "string" ? v.name : undefined,
            context_length:
              typeof v.context_length === "number"
                ? v.context_length
                : undefined,
            description:
              typeof v.description === "string" ? v.description : undefined,
          });
        }
      }

      parsed.sort((a, b) => a.id.localeCompare(b.id));
      setModels(parsed);
      setModelsUpdatedAt(Date.now());
    } catch (err) {
      setModels([]);
      setModelsUpdatedAt(null);
      setModelsError(
        `Could not load models: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    if (!loaded) return;
    // Load once on page open using the stored key (if any).
    if (settings.openRouterApiKey.trim().length > 0) {
      void loadModels(settings.openRouterApiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const missingPlaceholderPrompts = useMemo(() => {
    return settings.prompts.filter(
      (p) => !p.template.includes(TEMPLATE_PLACEHOLDER)
    );
  }, [settings.prompts]);

  const updateSettings = (next: ExtensionSettingsV2) => {
    setSettings(next);
    setDirty(true);
    setStatus("");
  };

  const save = () => {
    setSaving(true);
    setStatus("");
    chrome.storage.sync.set(
      {
        openRouterApiKey: settings.openRouterApiKey,
        prompts: settings.prompts,
      },
      () => {
        setSaving(false);
        setDirty(false);
        setStatus("Saved.");
      }
    );
  };

  const resetSettings = () => {
    const ok = window.confirm(
      "Reset all settings to defaults?\n\nThis will clear your OpenRouter API key and restore the default prompt list."
    );
    if (!ok) return;

    setSaving(true);
    setStatus("");
    chrome.storage.sync.set(
      {
        openRouterApiKey: DEFAULT_SETTINGS.openRouterApiKey,
        prompts: DEFAULT_SETTINGS.prompts,
      },
      () => {
        setSettings(DEFAULT_SETTINGS);
        setModels([]);
        setModelsUpdatedAt(null);
        setModelsError("");
        setSaving(false);
        setDirty(false);
        setStatus("Reset to defaults.");
      }
    );
  };

  const addPrompt = () => {
    const next: PromptConfig = {
      id: makeId(),
      model: "openai/gpt-4o-mini",
      template:
        "You are Lumpy.\n\n" +
        "Goal: help the user understand whatever question or input they provide.\n" +
        "Be concise, correct, and cite key details from any context given to you.\n\n" +
        `User input:\n${TEMPLATE_PLACEHOLDER}\n\n` +
        "Response:",
      compatMode: false,
      promptMode: "prompt",
      answerMode: "popup",
      keyboardShortcut: "",
    };
    updateSettings({ ...settings, prompts: [...settings.prompts, next] });
  };

  const removePrompt = (id: string) => {
    updateSettings({
      ...settings,
      prompts: settings.prompts.filter((p) => p.id !== id),
    });
  };

  const updatePrompt = (
    id: string,
    patch: Partial<Omit<PromptConfig, "id">>
  ) => {
    updateSettings({
      ...settings,
      prompts: settings.prompts.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    });
  };

  const onUploadPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!hasOpenRouterKey) {
      setRagError("Set an OpenRouter API key first (Save), then upload PDFs.");
      return;
    }

    setRagBusy(true);
    setRagError("");
    setRagStatus("");
    try {
      for (const file of Array.from(files)) {
        if (
          file.type !== "application/pdf" &&
          !file.name.toLowerCase().endsWith(".pdf")
        ) {
          continue;
        }

        setRagStatus(`Parsing ${file.name}…`);
        const buf = await file.arrayBuffer();
        const sha = await sha256Hex(buf);
        const docId = sha;

        const { pages, pageCount } = await extractPdfText(file);
        const chunks = chunkPages(pages);
        if (chunks.length === 0)
          throw new Error(`No text extracted from ${file.name}`);

        setRagStatus(
          `Embedding & indexing ${file.name} (${chunks.length} chunks)…`
        );
        const res = await sendMessage<RagIndexResponse>({
          type: "RAG_INDEX_DOCUMENT",
          apiKey: settings.openRouterApiKey,
          doc: {
            id: docId,
            name: file.name,
            pageCount,
            byteSize: file.size,
            sha256: sha,
          },
          chunks: chunks.map((c, i) => ({
            id: `${docId}:${i}`,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            text: c.text,
          })),
        });

        if (!res.ok) throw new Error(res.error);
      }

      setRagStatus("Done.");
      await refreshRagDocs();
    } catch (e) {
      setRagError(e instanceof Error ? e.message : String(e));
    } finally {
      setRagBusy(false);
    }
  };

  const deletePdfDoc = async (docId: string) => {
    const ok = window.confirm("Delete this PDF and all indexed chunks?");
    if (!ok) return;
    setRagBusy(true);
    setRagError("");
    try {
      const res = await sendMessage<RagDeleteDocResponse>({
        type: "RAG_DELETE_DOCUMENT",
        docId,
      });
      if (!res.ok) throw new Error(res.error);
      await refreshRagDocs();
    } catch (e) {
      setRagError(e instanceof Error ? e.message : String(e));
    } finally {
      setRagBusy(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-indigo-50">
        <div className="mx-auto max-w-3xl px-4 py-10 font-sans text-slate-700">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-50 via-white to-indigo-50 font-sans text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-fuchsia-300/30 blur-3xl" />
        <div className="absolute top-32 -right-24 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="Lumpy"
              className="size-16 rounded-2xl drop-shadow-sm"
            />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Lumpy Settings
              </h1>
              <div className="mt-1 text-sm text-slate-700">
                Make Lumpy behave how you like. Templates must include{" "}
                <code className="rounded bg-white/70 px-1 py-0.5 ring-1 ring-slate-900/10">
                  {TEMPLATE_PLACEHOLDER}
                </code>
                .
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={resetSettings}
              disabled={saving}
              title="Reset settings to defaults"
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-4 py-2 text-sm font-extrabold text-white shadow-sm ring-1 ring-black/5 hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={save}
              disabled={saving || !dirty}
              title={!dirty ? "No changes to save" : "Save settings"}
            >
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </div>

        {status ? (
          <div className="mb-6 rounded-2xl border border-fuchsia-200 bg-white/70 px-4 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
            {status}
          </div>
        ) : null}

        <section className="mb-8">
          <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
            <label
              className="mb-2 block text-sm font-extrabold text-slate-900"
              htmlFor="openRouterApiKey"
            >
              OpenRouter API Key
            </label>
            <input
              id="openRouterApiKey"
              className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              type="password"
              autoComplete="off"
              placeholder="sk-or-…"
              value={settings.openRouterApiKey}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  openRouterApiKey: e.target.value,
                })
              }
            />
            <div className="mt-2 text-xs text-slate-600">
              Stored in <code>chrome.storage.sync</code>.
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-bold text-slate-900">Prompts</div>
              <div className="mt-1 text-sm text-slate-600">
                Each prompt selects an OpenRouter model and a template.
              </div>
              <div className="mt-2 text-xs text-slate-600">
                {modelsLoading
                  ? "Loading models…"
                  : models.length
                  ? `Models loaded: ${models.length}${
                      modelsUpdatedAt
                        ? ` (updated ${new Date(
                            modelsUpdatedAt
                          ).toLocaleTimeString()})`
                        : ""
                    }`
                  : "Models not loaded."}
                {modelsError ? (
                  <div className="mt-1 text-xs text-red-700">{modelsError}</div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-sm font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white disabled:opacity-50"
              onClick={addPrompt}
              disabled={!hasOpenRouterKey}
            >
              + Add prompt
            </button>
          </div>

          {!hasOpenRouterKey ? (
            <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
              Add your <strong>OpenRouter API key</strong> above (then click{" "}
              <strong>Save changes</strong>) to configure prompts.
            </div>
          ) : null}

          {hasOpenRouterKey ? (
            <>
              {missingPlaceholderPrompts.length ? (
                <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50/70 px-4 py-3 text-sm text-slate-900 shadow-sm ring-1 ring-slate-900/5">
                  {missingPlaceholderPrompts.length} prompt
                  {missingPlaceholderPrompts.length === 1
                    ? ""
                    : "s"} missing <code>{TEMPLATE_PLACEHOLDER}</code>.
                </div>
              ) : null}

              <div className="flex flex-col gap-4">
                {settings.prompts.map((prompt, idx) => (
                  <div
                    key={prompt.id}
                    className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm ring-1 ring-slate-900/5 backdrop-blur"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="font-bold text-slate-900">
                        Prompt {idx + 1}
                      </div>
                      <button
                        type="button"
                        className="rounded-full bg-red-600 px-3 py-2 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => removePrompt(prompt.id)}
                        disabled={settings.prompts.length <= 1}
                        title={
                          settings.prompts.length <= 1
                            ? "Keep at least one prompt"
                            : "Remove prompt"
                        }
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 mb-4">
                      <div>
                        <label
                          className="mb-2 block text-sm font-semibold text-slate-900"
                          htmlFor={`model-${prompt.id}`}
                        >
                          Model (OpenRouter)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id={`model-${prompt.id}`}
                            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                            type="text"
                            list="openrouter-models"
                            placeholder="e.g. openai/gpt-4o-mini"
                            value={prompt.model}
                            onChange={(e) =>
                              updatePrompt(prompt.id, { model: e.target.value })
                            }
                          />
                          <button
                            type="button"
                            className="shrink-0 rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-sm font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white disabled:opacity-50"
                            onClick={() =>
                              void loadModels(settings.openRouterApiKey)
                            }
                            disabled={modelsLoading || !hasOpenRouterKey}
                            title="Refresh model list"
                          >
                            {modelsLoading ? "…" : "Refresh"}
                          </button>
                        </div>
                        {models.length ? (
                          <div className="mt-2 text-xs text-slate-600">
                            Tip: start typing to filter, then pick from the
                            list.
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label
                          className="mb-2 block text-sm font-semibold text-slate-900"
                          htmlFor={`command-${prompt.id}`}
                        >
                          Command slot
                        </label>
                        <select
                          id={`command-${prompt.id}`}
                          className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                          value={prompt.commandId ?? ""}
                          onChange={(e) =>
                            updatePrompt(prompt.id, {
                              commandId: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {Array.from({ length: 10 }).map((_, i) => {
                            const id = `run-prompt-${i + 1}`;
                            return (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            );
                          })}
                        </select>
                        <div className="mt-2 text-xs text-slate-600">
                          Assign this prompt to one of the predefined commands,
                          then set a keyboard shortcut in{" "}
                          <code>chrome://extensions/shortcuts</code>.
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200/70 bg-white/60 px-3 py-3 ring-1 ring-slate-900/5">
                        <div>
                          <label
                            className="mb-2 block text-sm font-semibold text-slate-900"
                            htmlFor={`promptMode-${prompt.id}`}
                          >
                            When to ask for input
                          </label>
                          <select
                            id={`promptMode-${prompt.id}`}
                            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                            value={prompt.promptMode}
                            onChange={(e) =>
                              updatePrompt(prompt.id, {
                                promptMode: e.target.value as "prompt" | "select",
                              })
                            }
                          >
                            <option value="prompt">Always prompt for additional input</option>
                            <option value="select">Only use selected text; prompt only when nothing is selected</option>
                          </select>
                          <div className="mt-2 text-xs text-slate-600">
                            Controls whether you always see an input step or only when no text is selected.
                          </div>
                        </div>

                        <div className="border-t border-slate-200/70 pt-3">
                          <label
                            className="mb-2 block text-sm font-semibold text-slate-900"
                            htmlFor={`answerMode-${prompt.id}`}
                          >
                            Where to show the answer
                          </label>
                          <select
                            id={`answerMode-${prompt.id}`}
                            className="w-full rounded-xl border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                            value={prompt.answerMode}
                            onChange={(e) =>
                              updatePrompt(prompt.id, {
                                answerMode: e.target.value as "popup" | "clipboard" | "popup-clipboard",
                              })
                            }
                          >
                            <option value="popup">Show in popup</option>
                            <option value="clipboard">Copy to clipboard only</option>
                            <option value="popup-clipboard">Popup and clipboard</option>
                          </select>
                          <div className="mt-2 text-xs text-slate-600">
                            Popup shows the answer in the Lumpy UI; clipboard-only runs without showing the popup.
                          </div>
                        </div>

                        <div className="border-t border-slate-200/70 pt-3">
                          <div className="flex items-center gap-2">
                            <input
                              id={`compat-${prompt.id}`}
                              type="checkbox"
                              checked={prompt.compatMode}
                              onChange={(e) =>
                                updatePrompt(prompt.id, {
                                  compatMode: e.target.checked,
                                })
                              }
                            />
                            <label
                              className="text-sm font-semibold text-slate-900"
                              htmlFor={`compat-${prompt.id}`}
                            >
                              Compatibility mode
                            </label>
                          </div>
                          <div className="mt-2 text-xs text-slate-600">
                            Use standard browser popups (alert, prompt) instead of
                            the custom on-page Lumpy popup.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label
                        className="mb-2 block text-sm font-semibold text-slate-900"
                        htmlFor={`template-${prompt.id}`}
                      >
                        Prompt template
                      </label>
                      <textarea
                        id={`template-${prompt.id}`}
                        className="w-full rounded-2xl border border-slate-300/80 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                        rows={10}
                        value={prompt.template}
                        onChange={(e) =>
                          updatePrompt(prompt.id, { template: e.target.value })
                        }
                      />
                      <div className="mt-2 text-xs text-slate-600">
                        Include <code>{TEMPLATE_PLACEHOLDER}</code> where the
                        extra text should go.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section className="mb-10">
          <div className="text-lg font-bold text-slate-900">PDF Library</div>
          <div className="mt-1 text-sm text-slate-600">
            Upload PDFs to build a local knowledge base. We’ll extract text,
            chunk it, generate embeddings, and retrieve relevant excerpts at
            question time.
          </div>

          {!hasOpenRouterKey ? (
            <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-slate-900/5 backdrop-blur">
              Add your <strong>OpenRouter API key</strong> above and click{" "}
              <strong>Save</strong> to enable PDF indexing.
            </div>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <input
              type="file"
              accept="application/pdf"
              multiple
              disabled={!hasOpenRouterKey || ragBusy}
              onChange={(e) => void onUploadPdf(e.target.files)}
            />
            {ragBusy ? (
              <div className="text-sm text-slate-700">Working…</div>
            ) : null}
            {ragStatus ? (
              <div className="text-sm text-slate-700">{ragStatus}</div>
            ) : null}
          </div>

          {ragError ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50/70 px-4 py-3 text-sm text-red-800 shadow-sm ring-1 ring-red-900/5">
              {ragError}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {ragDocs.length === 0 ? (
              <div className="text-sm text-slate-600">No PDFs indexed yet.</div>
            ) : (
              ragDocs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3 shadow-sm ring-1 ring-slate-900/5 backdrop-blur"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {d.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {d.pageCount} pages • {d.chunkCount} chunks •{" "}
                      {Math.round(d.byteSize / 1024)} KB • embed model:{" "}
                      <code>{d.embeddingModel}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-red-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={ragBusy}
                    onClick={() => void deletePdfDoc(d.id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {models.length ? (
          <datalist id="openrouter-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.id}
              </option>
            ))}
          </datalist>
        ) : null}

        <p className="mt-6 text-sm text-slate-700">
          {dirty ? "You have unsaved changes." : "All changes saved."}
        </p>
      </div>
    </div>
  );
}
