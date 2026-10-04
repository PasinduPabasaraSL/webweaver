import type { ElementSnapshot } from '@webweaver/workflow-schema';
import type { ActionDraft } from '../src';

export const PAGE_URL = 'https://example.com/login';

export function snapshot(overrides: Partial<ElementSnapshot> = {}): ElementSnapshot {
  return {
    tagName: 'input',
    classes: [],
    ariaAttributes: {},
    dataAttributes: {},
    attributes: {},
    ...overrides,
  };
}

export function inputDraft(value: string, at: string, url = PAGE_URL): ActionDraft {
  return {
    type: 'input',
    url,
    title: 'Login',
    timestamp: at,
    target: { element: snapshot({ id: 'username', value }) },
    value,
  };
}

export function clickDraft(at: string, element: Partial<ElementSnapshot> = {}): ActionDraft {
  return {
    type: 'click',
    url: PAGE_URL,
    title: 'Login',
    timestamp: at,
    target: { element: snapshot({ tagName: 'button', text: 'Log in', ...element }) },
    modifiers: { alt: false, ctrl: false, meta: false, shift: false },
  };
}

export function navigateDraft(
  url: string,
  trigger: Extract<ActionDraft, { type: 'navigate' }>['trigger'],
  at: string,
): ActionDraft {
  return { type: 'navigate', url, title: '', timestamp: at, trigger };
}
