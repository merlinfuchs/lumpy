/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  // Prefix all utility classes so we don't collide with real sites.
  prefix: "ba-",
  theme: {
    extend: {},
  },
  plugins: [],
  // IMPORTANT: Don't inject Tailwind's global preflight CSS into arbitrary webpages.
  // Content scripts share the DOM, so global resets can break sites.
  corePlugins: {
    preflight: false,
  },
};

