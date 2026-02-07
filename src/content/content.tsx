import React from "react";
import ReactDOM from "react-dom/client";
import "./content.css";
import ContentApp from "./ContentApp";

function ensureRoot(): HTMLElement {
  const existing = document.getElementById("browse-assist-root");
  if (existing) return existing;

  const root = document.createElement("div");
  root.id = "browse-assist-root";
  root.className =
    "ba-fixed ba-top-4 ba-right-4 ba-z-[2147483647] ba-font-sans";
  document.documentElement.appendChild(root);
  return root;
}

const rootEl = ensureRoot();
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ContentApp />
  </React.StrictMode>
);

export {};

