import type { NavigationTrigger } from '@webweaver/workflow-schema';

export type NavigationKind = 'committed' | 'history' | 'fragment';

/** Browser-agnostic shape of a `chrome.webNavigation` event. */
export interface NavigationEvent {
  kind: NavigationKind;
  tabId: number;
  frameId: number;
  url: string;
  timeStamp: number;
  transitionType?: string;
  transitionQualifiers?: string[];
}

const TRANSITION_TRIGGERS: Record<string, NavigationTrigger> = {
  link: 'link',
  typed: 'typed',
  auto_bookmark: 'typed',
  generated: 'typed',
  keyword: 'typed',
  keyword_generated: 'typed',
  start_page: 'typed',
  form_submit: 'form_submit',
  reload: 'reload',
};

/** Maps Chrome's transition type and qualifiers onto the schema's navigation triggers. */
export function navigationTrigger(event: NavigationEvent): NavigationTrigger {
  if (event.kind === 'history') return 'history_api';
  if (event.kind === 'fragment') return 'fragment';

  const qualifiers = event.transitionQualifiers ?? [];
  if (qualifiers.includes('forward_back')) return 'back_forward';
  if (event.transitionType === 'reload') return 'reload';
  if (qualifiers.includes('client_redirect')) return 'redirect';
  if (qualifiers.includes('from_address_bar')) return 'typed';
  return TRANSITION_TRIGGERS[event.transitionType ?? ''] ?? 'other';
}
