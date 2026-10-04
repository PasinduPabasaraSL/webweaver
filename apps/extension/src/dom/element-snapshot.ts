import {
  formatVariable,
  normalizeWhitespace,
  REDACTED_PLACEHOLDER,
  truncate,
  type SensitiveFieldMatch,
} from '@webweaver/core';
import type { BoundingBox, ElementSnapshot } from '@webweaver/workflow-schema';
import { buildCssPath, buildParentPath } from './css-path';
import { serializeElement } from './html-serializer';
import { readEditableValue } from './interactive-target';
import { getLabel } from './label';
import { getRole } from './role';
import { classifyElement, isFormControl, isHiddenInput, isValueBearing } from './sensitivity';
import { buildXPath } from './xpath';

export interface SnapshotLimits {
  text: number;
  value: number;
  attribute: number;
  html: number;
}

export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = {
  text: 200,
  value: 500,
  attribute: 500,
  html: 2000,
};

function placeholderFor(match: SensitiveFieldMatch): string {
  return formatVariable(match.variable);
}

/** Attribute replacement shared by the snapshot and its serialized HTML. */
function redactAttribute(element: Element, name: string): string | undefined {
  if (name !== 'value') return undefined;
  if (isHiddenInput(element)) return REDACTED_PLACEHOLDER;
  const match = classifyElement(element);
  return match ? placeholderFor(match) : undefined;
}

function boundingBoxOf(element: Element): BoundingBox {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function currentValue(
  element: Element,
  match: SensitiveFieldMatch | undefined,
): string | undefined {
  if (!(element instanceof HTMLElement)) return undefined;
  if (isValueBearing(element)) {
    return match ? placeholderFor(match) : readEditableValue(element);
  }
  return element.getAttribute('value') ?? undefined;
}

function splitAttributes(element: Element, limits: SnapshotLimits) {
  const ariaAttributes: Record<string, string> = {};
  const dataAttributes: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  for (const { name, value } of Array.from(element.attributes)) {
    const safeValue = redactAttribute(element, name) ?? truncate(value, limits.attribute);
    if (name.startsWith('aria-')) ariaAttributes[name] = safeValue;
    else if (name.startsWith('data-')) dataAttributes[name] = safeValue;
    else if (name !== 'id' && name !== 'class') attributes[name] = safeValue;
  }
  return { ariaAttributes, dataAttributes, attributes };
}

function setIfPresent<K extends keyof ElementSnapshot>(
  snapshot: ElementSnapshot,
  key: K,
  value: ElementSnapshot[K] | '' | null | undefined,
): void {
  if (value !== undefined && value !== null && value !== '') snapshot[key] = value;
}

/**
 * Captures a deterministic, redacted description of `element`.
 * `attributes` holds every attribute except `id`, `class`, `aria-*` and `data-*`, which
 * have dedicated fields.
 */
export function createElementSnapshot(
  element: Element,
  limits: SnapshotLimits = DEFAULT_SNAPSHOT_LIMITS,
): ElementSnapshot {
  const match = classifyElement(element);
  const snapshot: ElementSnapshot = {
    tagName: element.localName,
    classes: Array.from(element.classList),
    ...splitAttributes(element, limits),
  };

  setIfPresent(snapshot, 'id', element.id);
  setIfPresent(snapshot, 'name', element.getAttribute('name'));
  setIfPresent(snapshot, 'type', element.getAttribute('type'));
  if (!isFormControl(element) && !match) {
    const text = truncate(normalizeWhitespace(element.textContent ?? ''), limits.text);
    setIfPresent(snapshot, 'text', text);
  }
  const value = currentValue(element, match);
  setIfPresent(snapshot, 'value', value === undefined ? undefined : truncate(value, limits.value));
  setIfPresent(snapshot, 'label', getLabel(element));
  setIfPresent(snapshot, 'role', getRole(element));

  snapshot.cssSelector = buildCssPath(element);
  snapshot.xpath = buildXPath(element);
  setIfPresent(snapshot, 'parentPath', buildParentPath(element));
  snapshot.boundingBox = boundingBoxOf(element);
  snapshot.outerHTML = serializeElement(element, {
    maxLength: limits.html,
    redactAttribute: (el, name) => redactAttribute(el, name),
    hideChildren: (el) => classifyElement(el) !== undefined,
  });
  if (match) snapshot.redacted = true;
  return snapshot;
}
