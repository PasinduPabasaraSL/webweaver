import { normalizeWhitespace } from '@webweaver/core';
import { cssEscape } from './css-escape';

const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress']);

function textOf(element: Element | null | undefined): string {
  return element ? normalizeWhitespace(element.textContent ?? '') : '';
}

function labelledByText(element: Element): string {
  const ids = element.getAttribute('aria-labelledby')?.trim();
  if (!ids) return '';
  const doc = element.ownerDocument;
  return normalizeWhitespace(
    ids
      .split(/\s+/)
      .map((id) => textOf(doc.getElementById(id)))
      .join(' '),
  );
}

function associatedLabelText(element: Element): string {
  if (!LABELABLE.has(element.localName)) return '';
  const texts: string[] = [];
  if (element.id) {
    const root = element.getRootNode() as Document | ShadowRoot;
    root
      .querySelectorAll(`label[for="${cssEscape(element.id)}"]`)
      .forEach((label) => texts.push(textOf(label)));
  }
  const wrapping = element.closest('label');
  if (wrapping && !wrapping.hasAttribute('for')) texts.push(textOf(wrapping));
  return normalizeWhitespace(texts.filter(Boolean).join(' '));
}

/**
 * Deterministic approximation of the element's accessible label, in precedence order:
 * aria-labelledby, aria-label, associated <label>, alt, title.
 * Visible text content is captured separately in the snapshot's `text` field.
 */
export function getLabel(element: Element): string | undefined {
  const candidates = [
    labelledByText(element),
    normalizeWhitespace(element.getAttribute('aria-label') ?? ''),
    associatedLabelText(element),
    normalizeWhitespace(element.getAttribute('alt') ?? ''),
    normalizeWhitespace(element.getAttribute('title') ?? ''),
  ];
  return candidates.find((c) => c.length > 0);
}
