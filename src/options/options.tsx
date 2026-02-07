import React from "react";
import ReactDOM from "react-dom/client";
import "./options.css";
import OptionsApp from "./OptionsApp";

const root = document.createElement("div");
root.className = "options-root";
document.body.appendChild(root);
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
