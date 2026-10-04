import type { ElementSnapshot, RecordedAction } from '@webweaver/workflow-schema';
import { truncate } from './text';

const MAX_LABEL = 40;

/** Short human-readable name for an element, e.g. `button "Log in"` or `input #email`. */
export function describeElement(element: ElementSnapshot): string {
  const tag = element.tagName;
  const name =
    element.label ??
    element.text ??
    element.ariaAttributes['aria-label'] ??
    element.attributes['placeholder'];
  if (name) return `${tag} "${truncate(name, MAX_LABEL)}"`;
  if (element.id) return `${tag} #${element.id}`;
  if (element.name) return `${tag} [name=${element.name}]`;
  return tag;
}

/** Deterministic one-line summary of an action for status displays and logs. */
export function describeAction(action: RecordedAction): string {
  switch (action.type) {
    case 'navigate':
      return `Navigate to ${truncate(action.url, 80)}`;
    case 'click':
      return `Click ${describeElement(action.target.element)}`;
    case 'input':
      return `Fill ${describeElement(action.target.element)} with "${truncate(action.value, MAX_LABEL)}"`;
  }
}
