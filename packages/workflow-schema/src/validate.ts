import { ACTION_TYPES, NAVIGATION_TRIGGERS } from './actions';
import type { RecordingDocument } from './recording';
import { RECORDING_SCHEMA_VERSION } from './version';

export type ValidationResult =
  | { valid: true; recording: RecordingDocument }
  | { valid: false; errors: string[] };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

class ErrorCollector {
  readonly errors: string[] = [];

  add(path: string, message: string): void {
    this.errors.push(`${path}: ${message}`);
  }

  object(parent: JsonObject, key: string, path: string): JsonObject | undefined {
    const value = parent[key];
    if (!isObject(value)) {
      this.add(`${path}.${key}`, 'must be an object');
      return undefined;
    }
    return value;
  }

  string(parent: JsonObject, key: string, path: string, { optional = false } = {}): void {
    const value = parent[key];
    if (value === undefined && optional) return;
    if (typeof value !== 'string') this.add(`${path}.${key}`, 'must be a string');
  }

  nonEmptyString(parent: JsonObject, key: string, path: string): void {
    const value = parent[key];
    if (typeof value !== 'string' || value.length === 0) {
      this.add(`${path}.${key}`, 'must be a non-empty string');
    }
  }

  timestamp(parent: JsonObject, key: string, path: string): void {
    if (!isIsoTimestamp(parent[key])) this.add(`${path}.${key}`, 'must be an ISO-8601 timestamp');
  }

  boolean(parent: JsonObject, key: string, path: string): void {
    if (typeof parent[key] !== 'boolean') this.add(`${path}.${key}`, 'must be a boolean');
  }

  stringRecord(parent: JsonObject, key: string, path: string): void {
    const value = parent[key];
    if (!isObject(value) || Object.values(value).some((v) => typeof v !== 'string')) {
      this.add(`${path}.${key}`, 'must be an object of string values');
    }
  }
}

function validateElement(c: ErrorCollector, element: JsonObject, path: string): void {
  c.nonEmptyString(element, 'tagName', path);
  for (const key of ['id', 'name', 'type', 'text', 'value', 'label', 'role']) {
    c.string(element, key, path, { optional: true });
  }
  for (const key of ['cssSelector', 'xpath', 'parentPath', 'outerHTML']) {
    c.string(element, key, path, { optional: true });
  }
  const classes = element['classes'];
  if (!Array.isArray(classes) || classes.some((cls) => typeof cls !== 'string')) {
    c.add(`${path}.classes`, 'must be an array of strings');
  }
  c.stringRecord(element, 'ariaAttributes', path);
  c.stringRecord(element, 'dataAttributes', path);
  c.stringRecord(element, 'attributes', path);

  const box = element['boundingBox'];
  if (box !== undefined) {
    if (!isObject(box)) {
      c.add(`${path}.boundingBox`, 'must be an object');
    } else {
      for (const key of ['x', 'y', 'width', 'height']) {
        if (typeof box[key] !== 'number' || !Number.isFinite(box[key])) {
          c.add(`${path}.boundingBox.${key}`, 'must be a finite number');
        }
      }
    }
  }
}

function validateTarget(c: ErrorCollector, action: JsonObject, path: string): void {
  const target = c.object(action, 'target', path);
  if (!target) return;
  const element = c.object(target, 'element', `${path}.target`);
  if (element) validateElement(c, element, `${path}.target.element`);
}

function validateAction(c: ErrorCollector, action: unknown, path: string): void {
  if (!isObject(action)) {
    c.add(path, 'must be an object');
    return;
  }
  c.nonEmptyString(action, 'id', path);
  c.timestamp(action, 'timestamp', path);
  c.string(action, 'url', path);
  c.string(action, 'title', path);

  const type = action['type'];
  switch (type) {
    case 'navigate':
      if (!(NAVIGATION_TRIGGERS as readonly unknown[]).includes(action['trigger'])) {
        c.add(`${path}.trigger`, `must be one of ${NAVIGATION_TRIGGERS.join(', ')}`);
      }
      return;
    case 'click': {
      validateTarget(c, action, path);
      const modifiers = c.object(action, 'modifiers', path);
      if (modifiers) {
        for (const key of ['alt', 'ctrl', 'meta', 'shift']) {
          c.boolean(modifiers, key, `${path}.modifiers`);
        }
      }
      return;
    }
    case 'input': {
      validateTarget(c, action, path);
      c.string(action, 'value', path);
      const redaction = action['redaction'];
      if (redaction !== undefined) {
        if (!isObject(redaction)) {
          c.add(`${path}.redaction`, 'must be an object');
        } else {
          c.nonEmptyString(redaction, 'variable', `${path}.redaction`);
          c.nonEmptyString(redaction, 'reason', `${path}.redaction`);
        }
      }
      return;
    }
    default:
      c.add(`${path}.type`, `must be one of ${ACTION_TYPES.join(', ')}`);
  }
}

/** Structurally validates an unknown value (e.g. parsed JSON) as a recording document. */
export function validateRecording(input: unknown): ValidationResult {
  const c = new ErrorCollector();
  if (!isObject(input)) {
    return { valid: false, errors: ['$: must be an object'] };
  }

  if (input['version'] !== RECORDING_SCHEMA_VERSION) {
    c.add('$.version', `must be "${RECORDING_SCHEMA_VERSION}"`);
  }

  const workflow = c.object(input, 'workflow', '$');
  if (workflow) {
    c.nonEmptyString(workflow, 'id', '$.workflow');
    c.nonEmptyString(workflow, 'name', '$.workflow');
    c.timestamp(workflow, 'createdAt', '$.workflow');
    c.timestamp(workflow, 'endedAt', '$.workflow');
    c.string(workflow, 'startUrl', '$.workflow');
  }

  const recorder = c.object(input, 'recorder', '$');
  if (recorder) {
    c.nonEmptyString(recorder, 'name', '$.recorder');
    c.nonEmptyString(recorder, 'version', '$.recorder');
    c.string(recorder, 'userAgent', '$.recorder', { optional: true });
  }

  const actions = input['actions'];
  if (!Array.isArray(actions)) {
    c.add('$.actions', 'must be an array');
  } else {
    const seenIds = new Set<unknown>();
    actions.forEach((action, index) => {
      const path = `$.actions[${index}]`;
      validateAction(c, action, path);
      if (isObject(action)) {
        if (seenIds.has(action['id'])) c.add(`${path}.id`, 'must be unique');
        seenIds.add(action['id']);
      }
    });
  }

  return c.errors.length === 0
    ? { valid: true, recording: input as unknown as RecordingDocument }
    : { valid: false, errors: c.errors };
}
