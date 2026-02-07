// MV3 background service worker
//
// With no `action.default_popup`, clicking the extension icon triggers this handler.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

type OpenRouterChatRequest = {
  type: "OPENROUTER_CHAT";
  apiKey: string;
  model: string;
  prompt: string;
};

type OpenRouterChatResponse =
  | { ok: true; text: string }
  | { ok: false; error: string };

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = message as Partial<OpenRouterChatRequest> | null;
  if (!msg || msg.type !== "OPENROUTER_CHAT") return;

  (async () => {
    if (!msg.apiKey || !msg.model || !msg.prompt) {
      return { ok: false, error: "Missing apiKey/model/prompt" } satisfies OpenRouterChatResponse;
    }

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${msg.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Browse Assist",
      },
      body: JSON.stringify({
        model: msg.model,
        messages: [{ role: "user", content: msg.prompt }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        error: `OpenRouter error HTTP ${resp.status}${text ? `: ${text}` : ""}`,
      } satisfies OpenRouterChatResponse;
    }

    const json = (await resp.json()) as any;
    const content =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.text ??
      "";

    if (typeof content !== "string" || !content.trim()) {
      return { ok: false, error: "No content in OpenRouter response" } satisfies OpenRouterChatResponse;
    }

    return { ok: true, text: content } satisfies OpenRouterChatResponse;
  })()
    .then((res) => sendResponse(res))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies OpenRouterChatResponse)
    );

  return true; // keep the message channel open for async reply
});

export {};

