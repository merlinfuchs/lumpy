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
      <div className="ba-mx-auto ba-max-w-3xl ba-px-4 ba-py-8 ba-font-sans ba-text-slate-700">
        Loading…
      </div>
    );
  }

  return (
    <div className="ba-mx-auto ba-max-w-3xl ba-px-4 ba-py-8 ba-font-sans ba-text-slate-900">
      <div className="ba-flex ba-items-start ba-justify-between ba-gap-4 ba-mb-6">
        <div>
          <h1 className="ba-text-2xl ba-font-bold ba-tracking-tight">
            Browse Assist Settings
          </h1>
          <div className="ba-mt-1 ba-text-sm ba-text-slate-600">
            Templates must include <code>{TEMPLATE_PLACEHOLDER}</code> — that’s
            where the extension will inject additional text.
          </div>
        </div>

        <div className="ba-flex ba-items-center ba-gap-2">
          <button
            type="button"
            className="ba-rounded-lg ba-bg-blue-600 ba-px-4 ba-py-2 ba-text-sm ba-font-semibold ba-text-white hover:ba-bg-blue-700 disabled:ba-opacity-50 disabled:ba-cursor-not-allowed"
            onClick={save}
            disabled={saving || !dirty}
            title={!dirty ? "No changes to save" : "Save settings"}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {status ? (
        <div className="ba-mb-6 ba-rounded-lg ba-border ba-border-blue-200 ba-bg-blue-50 ba-px-4 ba-py-3 ba-text-sm ba-text-slate-900">
          {status}
        </div>
      ) : null}

      <section className="ba-mb-8">
        <label
          className="ba-mb-2 ba-block ba-text-sm ba-font-semibold ba-text-slate-900"
          htmlFor="openRouterApiKey"
        >
          OpenRouter API Key
        </label>
        <input
          id="openRouterApiKey"
          className="ba-w-full ba-rounded-lg ba-border ba-border-slate-300 ba-bg-white ba-px-3 ba-py-2 ba-text-sm ba-text-slate-900 placeholder:ba-text-slate-400 focus:ba-outline-none focus:ba-ring-2 focus:ba-ring-blue-500"
          type="password"
          autoComplete="off"
          placeholder="sk-or-…"
          value={settings.openRouterApiKey}
          onChange={(e) =>
            updateSettings({ ...settings, openRouterApiKey: e.target.value })
          }
        />
        <div className="ba-mt-2 ba-text-xs ba-text-slate-600">
          Stored in <code>chrome.storage.sync</code>. If you don’t want it
          synced across browsers, we can switch this to{" "}
          <code>storage.local</code>.
        </div>
      </section>

      <section className="ba-mb-6">
        <div className="ba-mb-4 ba-flex ba-items-start ba-justify-between ba-gap-4">
          <div>
            <div className="ba-text-lg ba-font-bold ba-text-slate-900">
              Prompts
            </div>
            <div className="ba-mt-1 ba-text-sm ba-text-slate-600">
              Each prompt selects an OpenRouter model and a template.
            </div>
          </div>
          <button
            type="button"
            className="ba-rounded-lg ba-border ba-border-slate-300 ba-bg-white ba-px-3 ba-py-2 ba-text-sm ba-font-semibold ba-text-slate-900 hover:ba-bg-slate-50"
            onClick={addPrompt}
          >
            + Add prompt
          </button>
        </div>

        {missingPlaceholderPrompts.length ? (
          <div className="ba-mb-4 ba-rounded-lg ba-border ba-border-amber-300 ba-bg-amber-50 ba-px-4 ba-py-3 ba-text-sm ba-text-slate-900">
            {missingPlaceholderPrompts.length} prompt
            {missingPlaceholderPrompts.length === 1 ? "" : "s"} missing{" "}
            <code>{TEMPLATE_PLACEHOLDER}</code>.
          </div>
        ) : null}

        <div className="ba-flex ba-flex-col ba-gap-4">
          {settings.prompts.map((prompt, idx) => (
            <div
              key={prompt.id}
              className="ba-rounded-xl ba-border ba-border-slate-200 ba-bg-white ba-p-4"
            >
              <div className="ba-mb-3 ba-flex ba-items-center ba-justify-between ba-gap-3">
                <div className="ba-font-bold ba-text-slate-900">
                  Prompt {idx + 1}
                </div>
                <button
                  type="button"
                  className="ba-rounded-lg ba-bg-red-600 ba-px-3 ba-py-2 ba-text-sm ba-font-semibold ba-text-white hover:ba-bg-red-700 disabled:ba-opacity-50 disabled:ba-cursor-not-allowed"
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

              <div className="ba-grid ba-grid-cols-1 ba-gap-4 ba-mb-4">
                <div>
                  <label
                    className="ba-mb-2 ba-block ba-text-sm ba-font-semibold ba-text-slate-900"
                    htmlFor={`model-${prompt.id}`}
                  >
                    Model (OpenRouter)
                  </label>
                  <input
                    id={`model-${prompt.id}`}
                    className="ba-w-full ba-rounded-lg ba-border ba-border-slate-300 ba-bg-white ba-px-3 ba-py-2 ba-text-sm ba-text-slate-900 placeholder:ba-text-slate-400 focus:ba-outline-none focus:ba-ring-2 focus:ba-ring-blue-500"
                    type="text"
                    placeholder="e.g. openai/gpt-4o-mini"
                    value={prompt.model}
                    onChange={(e) =>
                      updatePrompt(prompt.id, { model: e.target.value })
                    }
                  />
                </div>

                <div className="ba-rounded-lg ba-border ba-border-slate-200 ba-bg-slate-50 ba-px-3 ba-py-3">
                  <div className="ba-flex ba-items-center ba-gap-2">
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
                      className="ba-text-sm ba-font-semibold ba-text-slate-900"
                      htmlFor={`secret-${prompt.id}`}
                    >
                      Secret Mode
                    </label>
                  </div>
                  <div className="ba-mt-2 ba-text-xs ba-text-slate-600">
                    When enabled, you can treat this prompt as sensitive (e.g.
                    don’t log inputs / don’t show history).
                  </div>
                </div>
              </div>

              <div>
                <label
                  className="ba-mb-2 ba-block ba-text-sm ba-font-semibold ba-text-slate-900"
                  htmlFor={`template-${prompt.id}`}
                >
                  Prompt template
                </label>
                <textarea
                  id={`template-${prompt.id}`}
                  className="ba-w-full ba-rounded-lg ba-border ba-border-slate-300 ba-bg-white ba-px-3 ba-py-2 ba-font-mono ba-text-sm ba-text-slate-900 focus:ba-outline-none focus:ba-ring-2 focus:ba-ring-blue-500"
                  rows={10}
                  value={prompt.template}
                  onChange={(e) =>
                    updatePrompt(prompt.id, { template: e.target.value })
                  }
                />
                <div className="ba-mt-2 ba-text-xs ba-text-slate-600">
                  Include <code>{TEMPLATE_PLACEHOLDER}</code> where the extra
                  text should go.
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="ba-mt-6 ba-text-sm ba-text-slate-600">
        {dirty ? "You have unsaved changes." : "All changes saved."}
      </p>
    </div>
  );
}
