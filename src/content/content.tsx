import React from "react";
import ReactDOM from "react-dom/client";
import ContentApp from "./ContentApp";

function ensureHost(): HTMLElement {
  const existing = document.getElementById("browse-assist-root");
  if (existing) return existing;

  const host = document.createElement("div");
  host.id = "browse-assist-root";

  // Position the host using inline styles so we don't need global CSS on the page.
  host.style.position = "fixed";
  host.style.top = "16px";
  host.style.right = "16px";
  host.style.zIndex = "2147483647";

  document.documentElement.appendChild(host);
  return host;
}

const host = ensureHost();
const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

// Tailwind styles are injected into the ShadowRoot so they can't affect the host page.
// `require` keeps TypeScript happy without needing a special `*.css` module type.
const cssModule = require("./content.css");
const compiledCss: unknown = cssModule?.default ?? cssModule;

// Replace existing style tag if the script re-runs.
const STYLE_ID = "browse-assist-tailwind";
shadow.getElementById?.(STYLE_ID)?.remove();

const styleTag = document.createElement("style");
styleTag.id = STYLE_ID;
styleTag.textContent = typeof compiledCss === "string" ? compiledCss : "";
shadow.appendChild(styleTag);

if (typeof compiledCss !== "string") {
  console.warn("[browse-assist] content.css did not resolve to a string", {
    cssModule,
  });
}

const MOUNT_ID = "browse-assist-mount";
const existingMount = shadow.getElementById?.(MOUNT_ID) as HTMLElement | null;
const mount = existingMount ?? document.createElement("div");
mount.id = MOUNT_ID;
if (!existingMount) shadow.appendChild(mount);

const anyMount = mount as any;
const root = anyMount.__browseAssistRoot ?? ReactDOM.createRoot(mount);
anyMount.__browseAssistRoot = root;

root.render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
);

export {};
