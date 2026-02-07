// MV3 background service worker
//
// With no `action.default_popup`, clicking the extension icon triggers this handler.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

export {};

