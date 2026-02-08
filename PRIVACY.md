# Privacy Policy — Lumpy

**Effective date:** 2026-02-08

Lumpy is a browser extension that helps you understand webpages by sending user-provided text to an AI model (via OpenRouter) and displaying the response.

This policy explains what data Lumpy processes, where it’s stored, and when it’s shared.

## What Lumpy processes

Depending on how you use the extension, Lumpy may process:

- **Selected text / typed input**: the text you highlight on a page or enter when prompted.
- **Prompt templates and settings**: the prompt(s) you configure, model IDs, “Secret Mode” toggles, and related settings.
- **OpenRouter API key**: the key you provide in settings to make requests to OpenRouter.
- **Optional PDF Library content**: if you upload PDFs in Settings, Lumpy extracts text from the PDF to build a searchable library.

Lumpy does **not** intentionally collect sensitive categories of data. However, you control what you select/type/upload—so avoid sending sensitive information unless you understand the implications.

## Where data is stored

Lumpy stores data only in your browser:

- **`chrome.storage.sync`**:
  - OpenRouter API key (as entered by you)
  - Prompt configurations and settings
- **Local IndexedDB** (database name: `browseAssistRag`):
  - PDF metadata (filename, page count, size, timestamps)
  - Extracted PDF text chunks
  - Vector embeddings generated for those chunks

No developer-operated servers are used to store your data.

## When data is shared (third parties)

Lumpy makes network requests only to:

- **OpenRouter (`openrouter.ai`)**: to generate chat responses and to create embeddings for PDF search.

Specifically:

- When you run a prompt, Lumpy sends the **selected/typed text** plus your **prompt template output** to OpenRouter’s chat completion endpoint.
- If you use the PDF Library feature:
  - During indexing, Lumpy sends **extracted PDF text chunks** to OpenRouter’s embeddings endpoint to generate embeddings.
  - During search, Lumpy sends your **search query text** to OpenRouter’s embeddings endpoint to embed the query.
  - When answering with PDF context, Lumpy may include **top matching PDF excerpts** in the prompt it sends to OpenRouter.

OpenRouter’s handling of data is governed by their policies and the specific model providers you choose via OpenRouter. Review OpenRouter’s policies before using the extension with sensitive content.

## Permissions (why they’re needed)

- **`storage`**: save your API key and prompt/settings so the extension works across sessions.
- **`activeTab`**: access the current tab only when you trigger Lumpy so it can read your current selection and show the UI.
- **`scripting`**: inject the content UI into the page when you run a configured shortcut.
- **Host permission `https://openrouter.ai/*`**: make the required API calls to OpenRouter.

## Remote code

Lumpy does **not** download and execute remote code. It only sends HTTPS requests to OpenRouter and receives text responses.

## Data retention and deletion

- You can delete stored PDFs from the **PDF Library** section in Settings (this removes the stored chunks and embeddings from local IndexedDB).
- You can reset/clear settings from the **Settings** page (this removes the stored key and prompt configuration from `chrome.storage.sync`).
- Uninstalling the extension removes its locally stored data from the browser.

## Children’s privacy

Lumpy is not directed to children and is not intended for use by children under the age of 13.

## Changes to this policy

If the extension’s data practices change, this policy will be updated in this repository. The effective date at the top indicates the latest version.

## Contact

If you have questions or requests regarding this policy, contact: **contact@merlin.gg**.
