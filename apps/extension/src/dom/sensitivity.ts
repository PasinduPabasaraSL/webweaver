import { classifySensitiveField, type SensitiveFieldMatch } from '@webweaver/core';
import { getLabel } from './label';

const FORM_CONTROLS = new Set(['input', 'textarea', 'select']);

export function isFormControl(element: Element): boolean {
  return FORM_CONTROLS.has(element.localName);
}

export function isValueBearing(element: Element): boolean {
  return isFormControl(element) || element.hasAttribute('contenteditable');
}

/** Classifies value-bearing elements; other elements never hold user-entered secrets. */
export function classifyElement(element: Element): SensitiveFieldMatch | undefined {
  if (!isValueBearing(element)) return undefined;
  return classifySensitiveField({
    tagName: element.localName,
    type: element.getAttribute('type') ?? undefined,
    name: element.getAttribute('name') ?? undefined,
    id: element.id || undefined,
    autocomplete: element.getAttribute('autocomplete') ?? undefined,
    label: getLabel(element),
    placeholder: element.getAttribute('placeholder') ?? undefined,
  });
}

export function isHiddenInput(element: Element): boolean {
  return element.localName === 'input' && element.getAttribute('type')?.toLowerCase() === 'hidden';
}
