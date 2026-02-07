import React, { useState } from "react";

export default function ContentApp() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-lg hover:bg-blue-700"
      >
        Browse Assist
      </button>
    );
  }

  return (
    <div className="w-80 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
      <div className="flex items-center justify-between gap-3 bg-blue-600 px-3 py-2">
        <span className="text-sm font-bold text-white">Browse Assist</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/30"
        >
          Hide
        </button>
      </div>

      <div className="p-3 text-sm leading-relaxed">
        <div className="mb-2">
          This UI is rendered by the <strong>content script</strong>.
        </div>
        <div className="text-xs text-slate-600">
          URL:{" "}
          <span className="break-words text-slate-800">{location.href}</span>
        </div>
      </div>
    </div>
  );
}
