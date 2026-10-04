import type { RecordingDocument } from '@webweaver/workflow-schema';

/** Preferred key order in recording.json: identity first, bulky element details last. */
const KEY_ORDER = [
  'tagName',
  'id',
  'type',
  'name',
  'version',
  'workflow',
  'recorder',
  'actions',
  'trigger',
  'timestamp',
  'createdAt',
  'endedAt',
  'startUrl',
  'url',
  'title',
  'text',
  'value',
  'label',
  'redaction',
  'variable',
  'reason',
  'role',
  'modifiers',
  'target',
  'element',
  'classes',
  'ariaAttributes',
  'dataAttributes',
  'attributes',
  'cssSelector',
  'xpath',
  'parentPath',
  'boundingBox',
  'x',
  'y',
  'width',
  'height',
  'outerHTML',
  'redacted',
  'userAgent',
];

const KEY_RANK = new Map(KEY_ORDER.map((key, index) => [key, index]));

/** Maps of recorded page data whose own key order must be preserved as captured. */
const VERBATIM_MAPS = new Set(['ariaAttributes', 'dataAttributes', 'attributes']);

function rank(key: string): number {
  return KEY_RANK.get(key) ?? KEY_ORDER.length;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(
    entries.map(([key, child]) => [key, VERBATIM_MAPS.has(key) ? child : canonicalize(child)]),
  );
}

/**
 * Serializes with a canonical key order so output is stable and readable regardless of how
 * the document was stored (chrome.storage, for instance, returns keys sorted alphabetically).
 */
export function serializeRecording(recording: RecordingDocument): string {
  return JSON.stringify(canonicalize(recording), null, 2) + '\n';
}

/** File name such as `recording-example.com-20260929-053242.json`. */
export function recordingFileName(recording: RecordingDocument): string {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(recording.workflow.startUrl)?.[1];
  const slug = (host ?? 'page').toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  const stamp = recording.workflow.createdAt
    .replace(/\.\d+Z?$/, '')
    .replace(/Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-');
  return `recording-${slug}-${stamp}.json`;
}
