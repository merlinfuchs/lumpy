import React, { useEffect, useState } from "react";

export interface ExtensionSettings {
  theme: "light" | "dark";
  notificationsEnabled: boolean;
  showTips: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: "light",
  notificationsEnabled: true,
  showTips: true,
};

const STORAGE_KEYS: (keyof ExtensionSettings)[] = [
  "theme",
  "notificationsEnabled",
  "showTips",
];

function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(
      STORAGE_KEYS,
      (result: Partial<ExtensionSettings>) => {
        setSettings({ ...DEFAULT_SETTINGS, ...result });
        setLoaded(true);
      }
    );
  }, []);

  const updateSetting = <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K]
  ) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    chrome.storage.sync.set({ [key]: value });
  };

  if (!loaded) {
    return <div className="options-root">Loading…</div>;
  }

  return (
    <>
      <h1>Extension Settings</h1>

      <section>
        <label htmlFor="theme">Theme</label>
        <select
          id="theme"
          value={settings.theme}
          onChange={(e) =>
            updateSetting("theme", e.target.value as "light" | "dark")
          }
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </section>

      <section>
        <div className="option-row">
          <input
            id="notifications"
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) =>
              updateSetting("notificationsEnabled", e.target.checked)
            }
          />
          <label htmlFor="notifications">Enable notifications</label>
        </div>
      </section>

      <section>
        <div className="option-row">
          <input
            id="showTips"
            type="checkbox"
            checked={settings.showTips}
            onChange={(e) => updateSetting("showTips", e.target.checked)}
          />
          <label htmlFor="showTips">Show tips on new tabs</label>
        </div>
      </section>

      <p className="save-hint">Settings are saved automatically.</p>
    </>
  );
}

export default OptionsApp;
