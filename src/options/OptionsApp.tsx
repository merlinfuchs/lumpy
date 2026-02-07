import React, { useEffect, useMemo, useState } from "react";

export interface PromptConfig {
  id: string;
  model: string;
  template: string;
  secretMode: boolean;
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
        "You are a helpful assistant.\n\nUser input:\n{{input}}\n\nAnswer:",
      secretMode: false,
    },
  ],
};

const TEMPLATE_PLACEHOLDER = "{{input}}";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function isPromptConfig(value: unknown): value is PromptConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.model === "string" &&
    typeof v.template === "string" &&
    typeof v.secretMode === "boolean"
  );
}

function normalizeSettings(
  result: Record<string, unknown>
): ExtensionSettingsV2 {
  const openRouterApiKey =
    typeof result.openRouterApiKey === "string" ? result.openRouterApiKey : "";

  const promptsRaw = result.prompts;
  const prompts =
    Array.isArray(promptsRaw) && promptsRaw.every(isPromptConfig)
      ? (promptsRaw as PromptConfig[])
      : DEFAULT_SETTINGS.prompts;

  return { openRouterApiKey, prompts };
}

export default function OptionsApp() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] =
    useState<ExtensionSettingsV2>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    chrome.storage.sync.get([...STORAGE_KEYS], (result) => {
      setSettings(normalizeSettings(result));
      setLoaded(true);
      setDirty(false);
    });
  }, []);

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

  const addPrompt = () => {
    const next: PromptConfig = {
      id: makeId(),
      model: "openai/gpt-4o-mini",
      template: `Write a helpful response.\n\nUser input:\n${TEMPLATE_PLACEHOLDER}\n`,
      secretMode: false,
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

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 font-sans text-slate-700">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 font-sans text-slate-900">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Browse Assist Settings
          </h1>
          <div className="mt-1 text-sm text-slate-600">
            Templates must include <code>{TEMPLATE_PLACEHOLDER}</code> — that’s
            where the extension will inject additional text.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={save}
            disabled={saving || !dirty}
            title={!dirty ? "No changes to save" : "Save settings"}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {status ? (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-900">
          {status}
        </div>
      ) : null}

      <section className="mb-8">
        <label
          className="mb-2 block text-sm font-semibold text-slate-900"
          htmlFor="openRouterApiKey"
        >
          OpenRouter API Key
        </label>
        <input
          id="openRouterApiKey"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          type="password"
          autoComplete="off"
          placeholder="sk-or-…"
          value={settings.openRouterApiKey}
          onChange={(e) =>
            updateSettings({ ...settings, openRouterApiKey: e.target.value })
          }
        />
        <div className="mt-2 text-xs text-slate-600">
          Stored in <code>chrome.storage.sync</code>. If you don’t want it
          synced across browsers, we can switch this to{" "}
          <code>storage.local</code>.
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-slate-900">
              Prompts
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Each prompt selects an OpenRouter model and a template.
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            onClick={addPrompt}
          >
            + Add prompt
          </button>
        </div>

        {missingPlaceholderPrompts.length ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-slate-900">
            {missingPlaceholderPrompts.length} prompt
            {missingPlaceholderPrompts.length === 1 ? "" : "s"} missing{" "}
            <code>{TEMPLATE_PLACEHOLDER}</code>.
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {settings.prompts.map((prompt, idx) => (
            <div
              key={prompt.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-bold text-slate-900">
                  Prompt {idx + 1}
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <input
                    id={`model-${prompt.id}`}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="text"
                    placeholder="e.g. openai/gpt-4o-mini"
                    value={prompt.model}
                    onChange={(e) =>
                      updatePrompt(prompt.id, { model: e.target.value })
                    }
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      id={`secret-${prompt.id}`}
                      type="checkbox"
                      checked={prompt.secretMode}
                      onChange={(e) =>
                        updatePrompt(prompt.id, {
                          secretMode: e.target.checked,
                        })
                      }
                    />
                    <label
                      className="text-sm font-semibold text-slate-900"
                      htmlFor={`secret-${prompt.id}`}
                    >
                      Secret Mode
                    </label>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    When enabled, you can treat this prompt as sensitive (e.g.
                    don’t log inputs / don’t show history).
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
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={10}
                  value={prompt.template}
                  onChange={(e) =>
                    updatePrompt(prompt.id, { template: e.target.value })
                  }
                />
                <div className="mt-2 text-xs text-slate-600">
                  Include <code>{TEMPLATE_PLACEHOLDER}</code> where the extra
                  text should go.
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-600">
        {dirty ? "You have unsaved changes." : "All changes saved."}
      </p>
    </div>
  );
}
