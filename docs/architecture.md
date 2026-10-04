# WebWeaver architecture (Milestone 1)

## Principles

- **Evidence, not pixels.** Every action stores what the user interacted with (semantic element
  data), where (URL, title) and when. Nothing is inferred that was not observed.
- **Deterministic.** The same events always produce the same recording. There are no models,
  no randomness in decisions and no external services.
- **Redact at the source.** Secrets are replaced with variable placeholders before data leaves
  the page (or, for navigation URLs, before it is stored).
- **Pure core, thin adapters.** Business rules live in `packages/` and depend on neither the
  DOM nor `chrome.*`. The extension wires them to browser APIs through small injected
  interfaces, so most logic is unit-testable without a browser.

## Packages and dependency direction

```text
apps/extension ──► packages/core ──► packages/workflow-schema
       └──────────────────────────────►┘
```

| Package / folder                | Responsibility                                                           |
| ------------------------------- | ------------------------------------------------------------------------ |
| `packages/workflow-schema`      | Versioned types for `recording.json` and a structural validator.         |
| `packages/core`                 | Session reducer, URL/field redaction rules, action descriptions, export. |
| `apps/extension/src/dom`        | Element snapshot: CSS path, XPath, role, label, safe HTML serialization. |
| `apps/extension/src/recorder`   | `DomRecorder`: turns trusted DOM events into action drafts.              |
| `apps/extension/src/content`    | Content-script lifecycle (`ContentHost`) and entry point.                |
| `apps/extension/src/background` | `RecordingController`, message router, navigation mapping, state store.  |
| `apps/extension/src/messaging`  | Typed messages and runtime guards shared by all extension contexts.      |
| `apps/extension/src/popup`      | Pure view model, DOM rendering and download.                             |

`packages/core` and `packages/workflow-schema` compile against `lib: ES2022` only (no DOM, no
Node types), which enforces that they stay environment-independent.

## Data flow

1. **Start.** The popup sends `popup/start` with the active tab id. The controller validates
   the URL (http/https only), creates a session containing an `initial` navigate action, saves
   it, and tells the tab's content script to start. If no live content script answers (the tab
   predates an extension reload), it injects `content.js`. On start-up, that script asks for its
   status and begins recording by itself.
2. **Capture.** `DomRecorder` listens in the capture phase on `window` for trusted `click` and
   `input` events. It resolves the meaningful target, builds a redacted `ElementSnapshot` and
   sends a draft (an action without an id) plus a per-element `coalesceKey`.
3. **Navigation.** The service worker listens to `chrome.webNavigation` (`onCommitted`,
   `onHistoryStateUpdated`, `onReferenceFragmentUpdated`) for the recorded tab's top frame and
   maps Chrome's transition type and qualifiers to a `trigger`. On each new page, the content
   script reports the document title, which fills in the navigation's empty `title`.
4. **Reduce.** `appendDraft` (in core) assigns sequential ids and applies the merge rules
   below. Every controller operation runs through a `SerialQueue` and re-reads state from the
   store, so concurrent messages and service-worker restarts are safe.
5. **Stop.** The controller finalizes the session into a `RecordingDocument`, keeps it as
   `lastRecording` and returns it. The popup serializes it with a canonical key order and saves
   it with `chrome.downloads`.

## Deterministic rules

**Input coalescing.** An input draft whose `coalesceKey` equals that of the previous input
action replaces that action's value and target, keeping its id and first timestamp. Any other
action in between ends the run. The key comes from a `WeakMap` per page instance, so it
survives DOM changes that would alter the element's XPath.

**Navigation de-duplication.** A navigation to the URL the session is already on is dropped
when the previous action is also a navigation, or when the event is a history or fragment
update. Reloads are always kept.

**Click target resolution.** The recorded element is the closest ancestor matching an
interactive selector (`a[href]`, `button`, `input`, `label`, ARIA widget roles, and so on), or
the original element if none matches. When a `<label>` click is followed within 100 ms by the
click the browser forwards to its control, only the label click is recorded.

**Event filtering.** Only `event.isTrusted` events are recorded, so page scripts cannot inject
fake actions. Checkbox, radio, file and button-type inputs produce no input actions (their
clicks are recorded).

**Sensitive fields** (`classifySensitiveField`), first match wins:

1. `type="password"`.
2. `autocomplete` tokens: `current-password`, `new-password`, `one-time-code`, `cc-number`,
   `cc-csc`, `cc-exp*`.
3. Word patterns in the normalized name, id, label or placeholder (camelCase, snake_case and
   kebab-case are split into words). These cover password, card security code, card number,
   OTP, API key, token and secret.

The value becomes `{{VARIABLE}}` and `redaction.reason` records the rule that fired, for
example `id contains "password"`. Hidden inputs are scrubbed to `{{REDACTED}}` in HTML.

**URL redaction** works on the raw string, so the rest of the URL is preserved byte-for-byte. It
covers userinfo passwords, and query or fragment parameters that are on an exact-name list or
contain `password` / `secret` or end in `token`.

## Limits that keep recordings bounded

| Field                | Limit                                                             |
| -------------------- | ----------------------------------------------------------------- |
| Snapshot `text`      | 200 characters                                                    |
| Snapshot `value`     | 500 characters                                                    |
| Attribute values     | 500 characters (200 in HTML)                                      |
| `outerHTML`          | 2,000 characters; the serializer stops walking the DOM once spent |
| Input action `value` | 10,000 characters                                                 |

## `recording.json` format (schema `1.0`)

```jsonc
{
  "version": "1.0",
  "workflow": {
    "id": "uuid",
    "name": "Recording of example.com",
    "createdAt": "ISO-8601",
    "endedAt": "ISO-8601",
    "startUrl": "https://example.com/login",
  },
  "recorder": { "name": "webweaver-extension", "version": "0.1.0", "userAgent": "…" },
  "actions": [
    // every action: id ("action-001"), type, timestamp, url, title
    { "type": "navigate", "trigger": "initial" },
    {
      "type": "click",
      "modifiers": { "alt": false, "ctrl": false, "meta": false, "shift": false },
      "target": {
        "element": {
          /* ElementSnapshot */
        },
      },
    },
    {
      "type": "input",
      "value": "{{PASSWORD}}",
      "redaction": { "variable": "PASSWORD", "reason": "input type is \"password\"" },
      "target": {
        "element": {
          /* ElementSnapshot */
        },
      },
    },
  ],
}
```

`ElementSnapshot` fields: `tagName`, `id`, `name`, `type`, `text`, `value`, `label`, `role`,
`classes`, `ariaAttributes`, `dataAttributes`, `attributes` (everything except `id`, `class`,
`aria-*` and `data-*`), `cssSelector`, `xpath`, `parentPath`, `boundingBox` (viewport pixels),
`outerHTML` and `redacted`.

The TypeScript source of truth is `packages/workflow-schema/src`, and `validateRecording()`
checks documents structurally with JSON-path error messages. `examples/` holds a real
recording, and a test validates it against the current schema.

**Versioning.** Additive, backward-compatible changes (for example the selector candidates
coming in Milestone 2) bump the minor version. Breaking changes bump the major version and
must ship with a migration.

## Extension points for later milestones

- **Selector engine (M2):** add `target.selectors: SelectorCandidate[]` alongside
  `target.element`. The snapshot already contains the inputs a scorer needs.
- **Desktop bridge (M3):** recordings are plain JSON produced by core functions. An
  `ExtensionTransport` (WebSocket or native messaging) can forward the same drafts the content
  script sends today, without changing the recorder.
- **Network (M4):** `chrome.webRequest` / `chrome.debugger` events can be reduced into the
  same session as a new action type, correlated by timestamp.
