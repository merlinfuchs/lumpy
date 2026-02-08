<p align="center">
  <img src="static/icon512.png" alt="Lumpy" width="128" height="128" />
</p>

# Lumpy

Lumpy is a fun, lightweight browser extension that helps you understand what you’re reading on the web. Highlight text on any page, trigger a keyboard shortcut, and Lumpy will generate a helpful answer (via OpenRouter) right on the page.

## What it does

- **On-page helper**: shows a small popup on the current page with the response.
- **Works with selection or typed input**: highlight text first, or enter input when prompted.
- **Custom prompts**: configure multiple prompt slots, pick models, and edit templates.
- **Optional PDF Library**: upload PDFs, index them locally, and retrieve relevant excerpts when asking questions.

## Install from Release

### Download from Release

- Download the latest release from [the releases page](https://github.com/merlinfuchs/lumpy/releases/latest)
- Extract the zip file

### Load in Chrome / Chromium

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select the `dist/` folder

### Load in Firefox (untested)

- Open `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on…**
- Select `dist/manifest.json`

## Using Lumpy

- Signup for an [OpenRouter API key](https://openrouter.ai)
- Add payment method to your OpenRouter account
- Click on the extension icon in the toolbar and add your **OpenRouter API key**
- Assign prompt slots to commands, then set keyboard shortcuts in:
  - Chrome: `chrome://extensions/shortcuts`
- On any webpage:
  - Select some text
  - Run your configured shortcut
  - Read the answer in the on-page popup

## Development

### Build

```bash
npm ci
npm run build
```

Build output is written to `dist/`.

### Scripts

- `npm run build`: production build to `dist/`
- `npm run build:chrome` (or `npm run build-chrome`): builds and creates `artifacts/lumpy-chrome.zip`
- `npm run build:firefox` (or `npm run build-firefox`): builds and creates `artifacts/lumpy-firefox.zip`
- `npm run watch`: rebuild on changes

## Privacy

See [PRIVACY.md](PRIVACY.md).
