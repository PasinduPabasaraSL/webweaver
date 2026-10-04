# WebWeaver

WebWeaver is a local-first **web interaction recorder, DOM analyzer and automation generator**.
It records what a user does on a website (semantic element data, not screen coordinates) and
will later turn that evidence into executable Playwright and HTTP automation. It uses only
deterministic, rule-based analysis: no LLMs, no ML models, no external AI services.

**Status: Milestone 1.** The Chrome extension records navigation, clicks and text input with
DOM element metadata, and exports a versioned `recording.json`.

## Architecture in brief

```text
 Web page (content script)          Service worker (background)           Popup
┌──────────────────────────┐       ┌───────────────────────────────┐    ┌─────────────┐
│ DomRecorder              │ drafts│ RecordingController           │◄───│ Start / Stop│
│  click/input listeners   ├──────►│  session reducer (core)       │    │ status      │
│  element snapshot (dom/) │       │  chrome.webNavigation events  ├───►│ download    │
│  redaction at source     │       │  state in storage.session     │    └─────────────┘
└──────────────────────────┘       └───────────────────────────────┘
          ▲  start/stop commands               │ finalize
          └────────────────────────────────────┘      ▼
                                          recording.json (schema v1.0)
```

- **Content script** captures trusted `click` and `input` events, resolves the meaningful
  target element, snapshots it and redacts secrets before anything leaves the page.
- **Background service worker** owns the recording. It merges keystrokes into single
  input actions, records top-frame navigations with their trigger (link, form submit,
  history API, and so on) and persists state so MV3 worker restarts don't lose data.
- **Popup** starts and stops recording, shows live status and downloads the file.
- **Reusable logic lives in `packages/`** and is pure and environment-independent, so the
  future desktop app and generators can share it.

See [docs/architecture.md](docs/architecture.md) for the design details and the
`recording.json` format.

## Repository layout

```text
apps/
  extension/            Chrome MV3 extension (TypeScript + Vite)
    manifest.json
    popup.html
    src/
      background/       service worker: controller, routing, navigation, storage
      content/          content-script entry and lifecycle
      recorder/         DOM event recorder (click / input)
      dom/              element snapshot, CSS path, XPath, role, label, redaction
      messaging/        typed messages between popup, background and content
      popup/            popup view model, rendering, download
    test/               unit tests (Vitest + jsdom)
packages/
  workflow-schema/      versioned recording types + validator
  core/                 session reducer, redaction rules, export
tests/
  e2e/                  end-to-end test driving real Chrome over CDP
  examples.test.ts      validates files in examples/
examples/               sample recording produced by the e2e test
docs/                   architecture and format documentation
```

Planned packages (`selector-engine`, `network-analyzer`, `decision-engine`,
`playwright-generator`, `api-generator`) and `apps/desktop` (Tauri) arrive in later milestones.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 (`corepack enable` or `npm i -g pnpm`)
- Google Chrome or Chromium 116 or newer

## Build and load the extension

```bash
pnpm install
pnpm build            # outputs apps/extension/dist
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select `apps/extension/dist`.
4. Pin **WebWeaver Recorder** from the extensions (puzzle) menu so its icon is visible.

## Record a workflow

1. Open any `http://` or `https://` website.
2. Click the WebWeaver icon, then **Start Recording**. The badge shows `REC`.
3. Use the site normally: click, type, follow links, submit forms. Reopen the popup at any
   time to see the action count and the latest actions.
4. Click **Stop Recording**. The recording downloads to your default download folder as
   `recording-<host>-<yyyymmdd>-<hhmmss>.json`.
5. Open that file to see `navigate`, `click` and `input` actions with element metadata.

The last recording can be downloaded again with the **Download …** button until the browser
is closed. Closing the recorded tab also ends the recording.

### After changing code

Run `pnpm build`, then press the reload icon on the extension card in `chrome://extensions`.
Tabs that were already open don't need a page reload: when you start recording, WebWeaver
injects a fresh content script into the tab.

## Tests and quality checks

```bash
pnpm test            # unit tests (schema, core, extension with jsdom)
pnpm test:e2e        # builds, then records a real flow in headless Chrome
pnpm lint            # ESLint (type-aware)
pnpm typecheck       # tsc --noEmit for every package
pnpm format:check    # Prettier
pnpm check           # all of the above except e2e
```

The e2e test starts a local test website and launches Chrome with a temporary profile,
loading the extension through the DevTools protocol. It types, clicks, submits a login form
and follows links using trusted input events, stops through the real popup button, and
checks the downloaded file. It then reloads the extension and records again. It is skipped
when no Chrome is found. Useful environment variables:

| Variable           | Effect                                   |
| ------------------ | ---------------------------------------- |
| `CHROME_PATH`      | Chrome/Chromium executable to use        |
| `E2E_HEADED=1`     | Show the browser window                  |
| `E2E_NO_SANDBOX=1` | Pass `--no-sandbox` (some CI containers) |

The last e2e recording is written to `tests/e2e/.output/recording.json`.

## What gets recorded

| Action     | Source                             | Notes                                                                                                                                    |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `navigate` | `chrome.webNavigation` (top frame) | `trigger` is one of `initial`, `link`, `typed`, `form_submit`, `reload`, `back_forward`, `redirect`, `history_api`, `fragment`, `other`. |
| `click`    | trusted `click` events             | Target is the closest interactive ancestor (a click on an icon inside a button records the button). Modifier keys are included.          |
| `input`    | trusted `input` events             | Consecutive keystrokes in one field become a single action with the final value. Checkbox and radio toggles are recorded as clicks.      |

Each element snapshot contains the tag, id, name, type, text, value, label, role, classes,
`aria-*` and `data-*` attributes, other attributes, a CSS selector, an absolute XPath, the
parent path, the bounding box and size-limited outer HTML.

## Security

Secrets are redacted **in the page, before data reaches the extension's storage**:

- **Sensitive fields:** password fields, one-time codes, card numbers, CVCs and fields whose
  name, id, label or placeholder indicates a secret or token are recorded as `{{PASSWORD}}`,
  `{{OTP}}`, `{{CARD_NUMBER}}` and similar. Each has a `redaction.reason` explaining the rule
  that fired.
- **HTML:** hidden-input values and sensitive values are scrubbed from `outerHTML`, and
  `<script>` and `<style>` contents are skipped.
- **URLs:** sensitive query and fragment parameters (such as `token`, `password`,
  `api_key`, `session_id` and signatures) and userinfo passwords become placeholders, for
  example `?session_token={{API_TOKEN}}`.
- **Storage:** recording state lives in `chrome.storage.session`. It is kept in memory,
  cleared when the browser exits, and not readable by content scripts.
- **Messaging:** the background accepts lifecycle commands only from the extension's own
  pages, so web pages can't start or stop recordings.

Ordinary field values such as usernames and search terms are kept so the workflow can be
replayed. They will be parameterizable in a later milestone.

## Milestone 1 limitations

- Only the top frame is recorded. Interactions inside iframes are not.
- One tab at a time. Tabs or pop-up windows opened by the page are not followed.
- Selectors are baseline structural ones (CSS path, XPath). Ranked, scored selector
  candidates come with the selector engine in Milestone 2.
- Elements inside shadow DOM are recorded, but their selectors are relative to the shadow root.
- Keyboard, scroll, select, submit and double-click actions, file inputs, network recording
  and code generation are not implemented yet.
- `chrome://` pages, the Chrome Web Store and `file://` URLs cannot be recorded.

## Roadmap

1. **Recorder (this milestone):** clicks, input, navigation and `recording.json`.
2. DOM snapshots, selector engine and element fingerprints.
3. Tauri desktop application.
4. Network recording.
5. API correlation.
6. Playwright and API code generators.
7. API/UI decision engine.
8. Replay, testing, logs and screenshots.
9. Self-healing selectors.
