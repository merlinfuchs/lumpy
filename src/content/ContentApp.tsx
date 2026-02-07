import React, { useEffect, useMemo, useRef, useState } from "react";

type PromptConfig = {
  id: string;
  model: string;
  template: string;
  secretMode: boolean;
  keyboardShortcut: string;
};

type ExtensionSettings = {
  openRouterApiKey: string;
  prompts: PromptConfig[];
};

const TEMPLATE_PLACEHOLDER = "{{input}}";

function normalizePrompt(value: unknown): PromptConfig | null {
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

type ParsedShortcut = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string; // normalized
};

function parseShortcut(raw: string): ParsedShortcut | null {
  const s = raw.trim();
  if (!s) return null;
  const parts = s
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;

  const out: ParsedShortcut = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  for (const partRaw of parts) {
    const part = partRaw.toLowerCase();
    if (part === "ctrl" || part === "control") out.ctrl = true;
    else if (part === "shift") out.shift = true;
    else if (part === "alt" || part === "option") out.alt = true;
    else if (
      part === "cmd" ||
      part === "command" ||
      part === "meta" ||
      part === "super"
    )
      out.meta = true;
    else out.key = partRaw; // preserve case for special keys, normalize later
  }
  const key = out.key.trim();
  if (!key) return null;
  out.key = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  return out;
}

function shortcutMatches(e: KeyboardEvent, s: ParsedShortcut): boolean {
  if (!!e.ctrlKey !== s.ctrl) return false;
  if (!!e.shiftKey !== s.shift) return false;
  if (!!e.altKey !== s.alt) return false;
  if (!!e.metaKey !== s.meta) return false;
  const key = (e.key ?? "").toLowerCase();
  return key === s.key;
}

type UiMode = "idle" | "awaiting_input" | "thinking" | "done" | "error";

function fillTemplate(template: string, input: string): string {
  if (template.includes(TEMPLATE_PLACEHOLDER)) {
    return template.split(TEMPLATE_PLACEHOLDER).join(input);
  }
  return `${template}\n\n${input}`;
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

  const shortcuts = useMemo(() => {
    return settings.prompts
      .map((p) => ({ prompt: p, parsed: parseShortcut(p.keyboardShortcut) }))
      .filter((x) => x.parsed !== null) as { prompt: PromptConfig; parsed: ParsedShortcut }[];
  }, [settings.prompts]);

  const runningRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hidePopup = () => {
    setVisible(false);
    setMode("idle");
    setActivePrompt(null);
    setInputText("");
    setAnswer("");
    setError("");
  };

  useEffect(() => {
    chrome.storage.sync.get(["openRouterApiKey", "prompts"], (result) => {
      setSettings(normalizeSettings(result));
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.openRouterApiKey || changes.prompts) {
        chrome.storage.sync.get(["openRouterApiKey", "prompts"], (result) => {
          setSettings(normalizeSettings(result));
        });
      }
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ignore when typing in inputs/textareas/contenteditable
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase?.() ?? "";
      const isTypingTarget =
        tag === "input" ||
        tag === "textarea" ||
        (target as any)?.isContentEditable;
      if (isTypingTarget) return;

      for (const { prompt, parsed } of shortcuts) {
        if (!shortcutMatches(e, parsed)) continue;
        e.preventDefault();
        e.stopPropagation();
        void triggerPrompt(prompt);
        break;
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [shortcuts]);

  const triggerPrompt = async (prompt: PromptConfig) => {
    // Secret mode should leave no visible UI footprint.
    if (prompt.secretMode) {
      hidePopup();
      await runSecretPrompt(prompt);
      return;
    }

    setVisible(true);
    setActivePrompt(prompt);
    setAnswer("");
    setError("");

    if (!settings.openRouterApiKey.trim()) {
      setMode("error");
      setError("OpenRouter API key is not configured. Open settings to add it.");
      return;
    }

    if (runningRef.current) return;

    const selected = getSelectedText();
    if (!selected) {
      setMode("awaiting_input");
      setInputText("");
      // focus input next tick
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }

    await runPrompt(prompt, selected);
  };

  const runPrompt = async (prompt: PromptConfig, input: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setMode("thinking");
    setAnswer("");
    setError("");

    try {
      const promptText = fillTemplate(prompt.template, input);
      const res = await sendOpenRouterChat({
        apiKey: settings.openRouterApiKey,
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
    } finally {
      runningRef.current = false;
    }
  };

  const runSecretPrompt = async (prompt: PromptConfig) => {
    if (runningRef.current) return;
    if (!settings.openRouterApiKey.trim()) {
      window.alert(
        "Browse Assist: OpenRouter API key is not configured. Open the extension settings to add it."
      );
      return;
    }

    const selected = getSelectedText();
    const input =
      selected ||
      (window.prompt("Browse Assist (Secret Mode): Enter input", "") ?? "");
    if (!input.trim()) return;

    runningRef.current = true;
    try {
      const promptText = fillTemplate(prompt.template, input.trim());
      const res = await sendOpenRouterChat({
        apiKey: settings.openRouterApiKey,
        model: prompt.model,
        prompt: promptText,
      });

      if (!res.ok) {
        window.alert(`Browse Assist (Secret Mode) error: ${res.error}`);
        return;
      }

      window.alert(res.text);
    } catch (err) {
      window.alert(
        `Browse Assist (Secret Mode) error: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      runningRef.current = false;
    }
  };

  if (!visible) return null;

  return (
    <div className="w-80 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-blue-600 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white">Browse Assist</div>
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
        <button
          type="button"
          onClick={hidePopup}
          className="rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/30"
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
              No text selected — enter input:
            </div>
            <textarea
              ref={textareaRef}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type input to inject into {{input}}…"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                onClick={hidePopup}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={!activePrompt || !inputText.trim()}
                onClick={() => {
                  if (!activePrompt) return;
                  void runPrompt(activePrompt, inputText.trim());
                }}
              >
                Run
              </button>
            </div>
          </div>
        ) : null}

        {mode === "thinking" ? (
          <div className="flex items-center gap-2 text-sm text-slate-800">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            Thinking…
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() => chrome.runtime.openOptionsPage()}
              >
                Open settings
              </button>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
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
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
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
