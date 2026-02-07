/**
 * Content script
 *
 * Runs in an "isolated world": you can read/modify the DOM and observe page events,
 * but you don't share JS objects with the page's own scripts.
 *
 * If you need to call page-defined JS APIs (functions/objects created by the site),
 * you typically inject a <script> tag into the page to run in the page context.
 */
(() => {
  console.info("[browse-assist] content script loaded", {
    url: location.href,
    title: document.title,
  });

  // Example: expose a simple marker in the DOM for debugging.
  // (Remove or replace with your real logic.)
  document.documentElement.setAttribute("data-browse-assist", "enabled");
})();

export {};

