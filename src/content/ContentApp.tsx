import React, { useState } from "react";

export default function ContentApp() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ba-rounded-xl ba-bg-blue-600 ba-px-3 ba-py-2 ba-text-sm ba-font-bold ba-text-white ba-shadow-lg hover:ba-bg-blue-700"
      >
        Browse Assist
      </button>
    );
  }

  return (
    <div className="ba-w-80 ba-overflow-hidden ba-rounded-xl ba-border ba-border-slate-200 ba-bg-white ba-text-slate-900 ba-shadow-2xl">
      <div className="ba-flex ba-items-center ba-justify-between ba-gap-3 ba-bg-blue-600 ba-px-3 ba-py-2">
        <span className="ba-text-sm ba-font-bold ba-text-white">
          Browse Assist
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ba-rounded-lg ba-bg-white/20 ba-px-2 ba-py-1 ba-text-xs ba-font-semibold ba-text-white hover:ba-bg-white/30"
        >
          Hide
        </button>
      </div>

      <div className="ba-p-3 ba-text-sm ba-leading-relaxed">
        <div className="ba-mb-2">
          This UI is rendered by the <strong>content script</strong>.
        </div>
        <div className="ba-text-xs ba-text-slate-600">
          URL:{" "}
          <span className="ba-break-words ba-text-slate-800">
            {location.href}
          </span>
        </div>
      </div>
    </div>
  );
}
