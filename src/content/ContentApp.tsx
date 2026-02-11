import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PromptConfig = {
  id: string;
  model: string;
  template: string;
  compatMode: boolean;
  promptMode: "prompt" | "select";
  answerMode: "popup" | "clipboard" | "popup-clipboard";
  commandId?: string;
  keyboardShortcut?: string;
};

type ExtensionSettings = {
  openRouterApiKey: string;
  prompts: PromptConfig[];
};

const TEMPLATE_PLACEHOLDER = "{{input}}";

const ANSWER_MODES = ["popup", "clipboard", "popup-clipboard"] as const;
const PROMPT_MODES = ["prompt", "select"] as const;

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
  let promptMode: "prompt" | "select" = "prompt";
  let answerMode: "popup" | "clipboard" | "popup-clipboard" = "popup";
  if (
    typeof v.answerMode === "string" &&
    ANSWER_MODES.includes(v.answerMode as any)
  ) {
    answerMode = v.answerMode as "popup" | "clipboard" | "popup-clipboard";
  } else if (v.stealthMode === true) {
    answerMode = "clipboard";
    promptMode = "select";
  }
  if (
    typeof v.promptMode === "string" &&
    PROMPT_MODES.includes(v.promptMode as any)
  ) {
    promptMode = v.promptMode as "prompt" | "select";
  }
  return {
    id: v.id,
    model: v.model,
    template: v.template,
    compatMode: v.compatMode,
    promptMode,
    answerMode,
    keyboardShortcut:
      typeof v.keyboardShortcut === "string" ? v.keyboardShortcut : "",
  };
}

function normalizeSettings(result: Record<string, unknown>): ExtensionSettings {
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
    prompts,
  };
}

function getSelectedText(): string {
  const text = window.getSelection?.()?.toString?.() ?? "";
  return text.trim();
}

type UiMode = "idle" | "awaiting_input" | "thinking" | "done" | "error";

function fillTemplate(template: string, input: string): string {
  if (template.includes(TEMPLATE_PLACEHOLDER)) {
    return template.split(TEMPLATE_PLACEHOLDER).join(input);
  }
  return `${template}\n\n${input}`;
}

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

function sendRagSearch(request: {
  apiKey: string;
  query: string;
  topK: number;
}): Promise<RagSearchResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "RAG_SEARCH", ...request }, (response) =>
      resolve(response as RagSearchResponse)
    );
  });
}

function formatPdfContext(hits: RagSearchHit[]): string {
  if (!hits.length) return "";
  const MAX_CHARS_PER_HIT = 1400;
  const lines: string[] = [];
  lines.push("--- PDF Context (top matches) ---");
  for (const h of hits) {
    const name = h.docName ?? h.docId;
    const pages =
      h.pageStart === h.pageEnd
        ? `p.${h.pageStart}`
        : `p.${h.pageStart}-${h.pageEnd}`;
    const text = (h.text || "").slice(0, MAX_CHARS_PER_HIT);
    lines.push(`[${name} | ${pages}]`);
    lines.push(text);
    lines.push("");
  }
  lines.push("--- End PDF Context ---");
  return lines.join("\n");
}

async function buildPromptWithPdfContext(args: {
  apiKey: string;
  template: string;
  input: string;
}): Promise<string> {
  const base = fillTemplate(args.template, args.input);
  try {
    const res = await sendRagSearch({
      apiKey: args.apiKey,
      query: args.input,
      topK: 6,
    });
    if (!res.ok) return base;
    if (!res.hits.length) return base;
    const ctx = formatPdfContext(res.hits);
    return `${base}\n\n${ctx}`;
  } catch {
    return base;
  }
}

function sendOpenRouterChat(request: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "OPENROUTER_CHAT", ...request },
      (response) => resolve(response as any)
    );
  });
}

export default function ContentApp() {
  const logoUrl = useMemo(
    () => chrome.runtime.getURL("static/icon512.png"),
    []
  );

  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<UiMode>("idle");
  const [settings, setSettings] = useState<ExtensionSettings>({
    openRouterApiKey: "",
    prompts: [],
  });
  const [activePrompt, setActivePrompt] = useState<PromptConfig | null>(null);
  const [inputText, setInputText] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  const runningRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const apiKeyRef = useRef<string>("");
  const lastRunPromptMsgRef = useRef<{ promptId: string; at: number } | null>(
    null
  );

  const hidePopup = useCallback(() => {
    setVisible(false);
    setMode("idle");
    setActivePrompt(null);
    setInputText("");
    setAnswer("");
    setError("");
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        hidePopup();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, hidePopup]);

  useEffect(() => {
    chrome.storage.sync.get(["openRouterApiKey", "prompts"], (result) => {
      const next = normalizeSettings(result);
      apiKeyRef.current = next.openRouterApiKey;
      setSettings(next);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.openRouterApiKey || changes.prompts) {
        chrome.storage.sync.get(["openRouterApiKey", "prompts"], (result) => {
          const next = normalizeSettings(result);
          apiKeyRef.current = next.openRouterApiKey;
          setSettings(next);
        });
      }
    });
  }, []);

  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message as any;
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "BROWSE_ASSIST_PING") {
        sendResponse({ ok: true });
        return;
      }

      if (msg.type !== "RUN_PROMPT") return;
      const prompt = msg.prompt as PromptConfig | undefined;
      const apiKey = typeof msg.apiKey === "string" ? msg.apiKey : "";
      if (apiKey) apiKeyRef.current = apiKey;
      // Keep state in sync (async), but use the ref for immediate reads.
      setSettings((prev) =>
        apiKey ? { ...prev, openRouterApiKey: apiKey } : prev
      );
      // Background may retry RUN_PROMPT shortly after the first send.
      // If the popup steals focus, selection can disappear; de-dupe prevents
      // the second message from wiping prefilled selection text.
      if (prompt?.id) {
        const now = Date.now();
        const last = lastRunPromptMsgRef.current;
        if (last && last.promptId === prompt.id && now - last.at < 400) {
          return;
        }
        lastRunPromptMsgRef.current = { promptId: prompt.id, at: now };
      }

      if (prompt) {
        void triggerPrompt(prompt);
      }
    });
  }, []);

  const triggerPrompt = async (prompt: PromptConfig) => {
    const apiKey = apiKeyRef.current || settings.openRouterApiKey;

    // Compatibility mode: use browser alert/prompt only, no custom UI.
    if (prompt.compatMode) {
      hidePopup();
      await runCompatibilityPrompt(prompt);
      return;
    }

    // Answer to clipboard only, no popup: run headless (with optional window.prompt for input when promptMode is 'prompt').
    if (prompt.answerMode === "clipboard") {
      hidePopup();
      await runClipboardOnlyPrompt(prompt, apiKey);
      return;
    }

    // Show custom popup for input and/or answer.
    setVisible(true);
    setActivePrompt(prompt);
    setAnswer("");
    setError("");

    if (!apiKey.trim()) {
      setMode("error");
      setError(
        "OpenRouter API key is not configured. Open settings to add it."
      );
      return;
    }

    if (runningRef.current) return;

    const selected = getSelectedText();
    const useSelectionOnly = prompt.promptMode === "select";

    if (useSelectionOnly && selected.trim()) {
      // Use selection only (no input step).
      await runPrompt(prompt, selected.trim(), apiKey);
      return;
    }

    // Show input step:
    // - promptMode === "prompt": always show (prefill with selection so users can add more)
    // - promptMode === "select": only when nothing is selected
    setMode("awaiting_input");
    setInputText(useSelectionOnly ? "" : selected);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const runPrompt = async (
    prompt: PromptConfig,
    input: string,
    apiKey: string
  ) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setMode("thinking");
    setAnswer("");
    setError("");

    try {
      const promptText = await buildPromptWithPdfContext({
        apiKey,
        template: prompt.template,
        input,
      });
      const res = await sendOpenRouterChat({
        apiKey,
        model: prompt.model,
        prompt: promptText,
      });
      if (!res.ok) {
        setMode("error");
        setError(res.error);
        return;
      }
      setMode("done");
      setAnswer(res.text);
      if (prompt.answerMode === "popup-clipboard") {
        copyToClipboardBestEffort(res.text);
      }
    } finally {
      runningRef.current = false;
    }
  };

  function copyToClipboardBestEffort(text: string): boolean {
    // Best-effort clipboard copy with no UI. This may still be blocked on some sites
    // if the browser requires an explicit user gesture.
    try {
      // If available, attempt async clipboard API.
      void navigator.clipboard?.writeText?.(text);
      return true;
    } catch {
      // ignore
    }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.documentElement.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  const runCompatibilityPrompt = async (prompt: PromptConfig) => {
    if (runningRef.current) return;
    const apiKey = apiKeyRef.current || settings.openRouterApiKey;
    if (!apiKey.trim()) {
      window.alert(
        "Lumpy: OpenRouter API key is not configured. Open the extension settings to add it."
      );
      return;
    }

    const selected = getSelectedText();
    let input: string;
    if (prompt.promptMode === "select") {
      if (selected.trim()) {
        input = selected.trim();
      } else {
        const prompted =
          window.prompt(
            "Lumpy (Compatibility): No selection — enter input",
            ""
          ) ?? "";
        if (!prompted.trim()) return;
        input = prompted.trim();
      }
    } else {
      // Always prompt: prefill with selection so user can add or edit (selection + additional input)
      const prompted =
        window.prompt(
          "Lumpy (Compatibility): Enter or add to input",
          selected || ""
        ) ?? "";
      if (!prompted.trim()) return;
      input = prompted.trim();
    }

    runningRef.current = true;
    try {
      const promptText = await buildPromptWithPdfContext({
        apiKey,
        template: prompt.template,
        input,
      });
      const res = await sendOpenRouterChat({
        apiKey,
        model: prompt.model,
        prompt: promptText,
      });

      if (!res.ok) {
        window.alert(`Lumpy (Compatibility Mode) error: ${res.error}`);
        return;
      }

      const showPopup =
        prompt.answerMode === "popup" ||
        prompt.answerMode === "popup-clipboard";
      const copyToClipboard =
        prompt.answerMode === "clipboard" ||
        prompt.answerMode === "popup-clipboard";
      if (showPopup) window.alert(res.text);
      if (copyToClipboard) copyToClipboardBestEffort(res.text);
    } catch (err) {
      window.alert(
        `Lumpy (Compatibility Mode) error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      runningRef.current = false;
    }
  };

  const runClipboardOnlyPrompt = async (
    prompt: PromptConfig,
    apiKey: string
  ) => {
    if (runningRef.current) return;
    if (!apiKey.trim()) return;

    const selected = getSelectedText();
    let input: string;
    if (prompt.promptMode === "select") {
      if (!selected.trim()) return;
      input = selected.trim();
    } else {
      // Always prompt: prefill with selection so user can add or edit (selection + additional input)
      const prompted =
        window.prompt(
          "Lumpy: Enter or add to input (clipboard-only mode)",
          selected || ""
        ) ?? "";
      if (!prompted.trim()) return;
      input = prompted.trim();
    }

    runningRef.current = true;
    try {
      const promptText = await buildPromptWithPdfContext({
        apiKey,
        template: prompt.template,
        input,
      });
      const res = await sendOpenRouterChat({
        apiKey,
        model: prompt.model,
        prompt: promptText,
      });
      if (!res.ok) return;
      copyToClipboardBestEffort(res.text);
    } finally {
      runningRef.current = false;
    }
  };

  if (!visible) return null;

  return (
    <div className="w-80 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 text-slate-900 shadow-2xl ring-1 ring-slate-900/5 backdrop-blur">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src={logoUrl}
            alt="Lumpy"
            className="size-10 rounded-xl drop-shadow-sm"
          />
          <div className="min-w-0">
            <div className="text-sm font-black tracking-tight text-white">
              Lumpy
            </div>
            {activePrompt ? (
              <div className="truncate text-[11px] text-white/90">
                {activePrompt.model}
                {activePrompt.keyboardShortcut
                  ? ` • ${activePrompt.keyboardShortcut}`
                  : ""}
              </div>
            ) : (
              <div className="text-[11px] text-white/90">
                Press a configured shortcut to run a prompt
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={hidePopup}
          className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-white/30"
          title="Close"
        >
          Close
        </button>
      </div>

      <div className="p-3 text-sm leading-relaxed">
        {mode === "idle" ? (
          <div className="text-xs text-slate-700">
            Select some text on the page and press a configured shortcut.
          </div>
        ) : null}

        {mode === "awaiting_input" ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-700">
              {inputText.trim()
                ? "Selection + additional input (edit as needed):"
                : "No text selected — enter input:"}
            </div>
            <textarea
              ref={textareaRef}
              className="w-full rounded-2xl border border-slate-300/80 bg-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (e.shiftKey) return; // Shift+Enter inserts newline
                e.preventDefault(); // Enter submits
                if (!activePrompt) return;
                const apiKey = apiKeyRef.current || settings.openRouterApiKey;
                if (!inputText.trim()) return;
                void runPrompt(activePrompt, inputText.trim(), apiKey);
              }}
              placeholder="Type input to inject into {{input}}…"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white"
                onClick={hidePopup}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm ring-1 ring-black/5 hover:from-fuchsia-500 hover:via-purple-500 hover:to-indigo-500 disabled:opacity-50"
                disabled={!activePrompt || !inputText.trim()}
                onClick={() => {
                  if (!activePrompt) return;
                  const apiKey = apiKeyRef.current || settings.openRouterApiKey;
                  void runPrompt(activePrompt, inputText.trim(), apiKey);
                }}
              >
                Run
              </button>
            </div>
          </div>
        ) : null}

        {mode === "thinking" ? (
          <div className="flex items-center gap-2 text-sm text-slate-800">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-fuchsia-600" />
            Lumpy is thinking…
          </div>
        ) : null}

        {mode === "error" ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error || "Something went wrong."}
            </div>
            {!settings.openRouterApiKey.trim() ? (
              <button
                type="button"
                className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                Open settings
              </button>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white"
                onClick={hidePopup}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {mode === "done" ? (
          <div className="space-y-2">
            <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
              {answer}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300/80 bg-white/80 px-3 py-2 text-xs font-extrabold text-slate-900 shadow-sm backdrop-blur hover:bg-white"
                onClick={hidePopup}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
