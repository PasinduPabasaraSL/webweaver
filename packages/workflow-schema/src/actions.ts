import type { ElementSnapshot } from './element';

export const ACTION_TYPES = ['navigate', 'click', 'input'] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

interface BaseAction {
  /** Stable, sequential identifier, e.g. `action-001`. */
  id: string;
  type: ActionType;
  /** ISO-8601 timestamp of the first event that produced this action. */
  timestamp: string;
  /** Page URL at the time of the action (sensitive query parameters redacted). */
  url: string;
  title: string;
}

export const NAVIGATION_TRIGGERS = [
  'initial',
  'link',
  'typed',
  'form_submit',
  'reload',
  'back_forward',
  'redirect',
  'history_api',
  'fragment',
  'other',
] as const;

export type NavigationTrigger = (typeof NAVIGATION_TRIGGERS)[number];

export interface NavigateAction extends BaseAction {
  type: 'navigate';
  /** What caused the navigation, as reported by the browser. */
  trigger: NavigationTrigger;
}

export interface ActionTarget {
  element: ElementSnapshot;
}

export interface KeyModifiers {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

export interface ClickAction extends BaseAction {
  type: 'click';
  target: ActionTarget;
  modifiers: KeyModifiers;
}

export interface Redaction {
  /** Variable name the real value must be supplied through, e.g. `PASSWORD`. */
  variable: string;
  /** Deterministic, human-readable reason the value was redacted. */
  reason: string;
}

export interface InputAction extends BaseAction {
  type: 'input';
  target: ActionTarget;
  /** Final value of the field, or a `{{VARIABLE}}` placeholder when redacted. */
  value: string;
  redaction?: Redaction;
}

export type RecordedAction = NavigateAction | ClickAction | InputAction;

export type ElementAction = ClickAction | InputAction;
