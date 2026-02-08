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

## Setup (development / unpacked)

### Build

```bash
npm ci
npm run build
```

Build output is written to `dist/`.

### Load in Chrome / Chromium

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select the `dist/` folder

### Load in Firefox (temporary add-on)

- Open `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on…**
- Select `dist/manifest.json`

## Using Lumpy

- Open the extension **Options/Settings** page and add your **OpenRouter API key**
- Assign prompt slots to commands, then set keyboard shortcuts in:
  - Chrome: `chrome://extensions/shortcuts`
- On any webpage:
  - Select some text
  - Run your configured shortcut
  - Read the answer in the on-page popup

## Scripts

- `npm run build`: production build to `dist/`
- `npm run build:chrome` (or `npm run build-chrome`): builds and creates `artifacts/lumpy-chrome.zip`
- `npm run build:firefox` (or `npm run build-firefox`): builds and creates `artifacts/lumpy-firefox.zip`
- `npm run watch`: rebuild on changes

## Privacy

See `PRIVACY.md`.

## Store publishing (GitHub Actions)

This repo includes a workflow that builds `dist/`, packages it, and publishes to:

- **Chrome Web Store** (upload + publish)
- **Firefox AMO** (submit/sign via `web-ext sign`)

### Triggers

- **Automatic**: when a GitHub Release is published
- **Manual**: via _Actions → Publish to Chrome + Firefox Stores_

### Required GitHub Secrets

Set these in _Repo → Settings → Secrets and variables → Actions → Secrets_:

#### Chrome Web Store

- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

#### Firefox AMO

- `FIREFOX_JWT_ISSUER`
- `FIREFOX_JWT_SECRET`
- `FIREFOX_GECKO_ID` (the add-on ID, e.g. `lumpy@example.com` or a UUID)
