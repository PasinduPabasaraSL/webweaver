const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  'option',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(',');

/** Returns the element an event originated from, looking through shadow roots and text nodes. */
export function eventOriginElement(event: Event): Element | undefined {
  const origin = event.composedPath()[0] ?? event.target;
  if (origin instanceof Element) return origin;
  if (origin instanceof Node) return origin.parentElement ?? undefined;
  return undefined;
}

/**
 * Clicks usually land on an inner node (an <svg> icon inside a <button>, a <span> inside
 * an <a>). The meaningful target is the closest interactive ancestor; if there is none,
 * the original element is kept.
 */
export function resolveInteractiveTarget(origin: Element): Element {
  return origin.closest(INTERACTIVE_SELECTOR) ?? origin;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'hidden',
]);

/**
 * Returns the element whose value an `input` event changed, or undefined when the event
 * should not become an input action (checkbox/radio toggles are recorded as clicks; file
 * inputs are out of scope for Milestone 1).
 */
export function resolveEditableTarget(origin: Element): HTMLElement | undefined {
  if (origin instanceof HTMLInputElement) {
    return NON_TEXT_INPUT_TYPES.has(origin.type) ? undefined : origin;
  }
  if (origin instanceof HTMLTextAreaElement || origin instanceof HTMLSelectElement) return origin;
  // The nearest ancestor carrying the attribute decides editability; "false" opts out.
  const host = origin.closest('[contenteditable]');
  if (host instanceof HTMLElement && host.getAttribute('contenteditable') !== 'false') return host;
  return undefined;
}

export function readEditableValue(element: HTMLElement): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return element.textContent ?? '';
}
