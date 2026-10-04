import {
  RECORDING_SCHEMA_VERSION,
  type RecordedAction,
  type RecorderInfo,
  type RecordingDocument,
} from '@webweaver/workflow-schema';
import { redactUrl } from '../redaction/redact-url';
import { formatActionId, type ActionDraft } from './action-draft';

/** In-progress recording. Plain JSON so it can be persisted between service-worker restarts. */
export interface RecordingSession {
  id: string;
  name: string;
  startedAt: string;
  startUrl: string;
  actions: RecordedAction[];
  nextSequence: number;
  /** Identity of the element that produced the last input action, used for coalescing. */
  lastCoalesceKey?: string;
}

export interface CreateSessionOptions {
  id: string;
  startedAt: Date;
  startUrl: string;
  startTitle: string;
  name?: string;
}

export interface AppendOptions {
  /**
   * Stable identity of the source element for the lifetime of a page. Consecutive input
   * drafts with the same key are merged into one action holding the latest value.
   */
  coalesceKey?: string;
}

export type AppendOutcome = 'appended' | 'merged' | 'skipped';

export interface AppendResult {
  session: RecordingSession;
  outcome: AppendOutcome;
}

export function defaultRecordingName(url: string): string {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(url)?.[1];
  return host ? `Recording of ${host}` : 'Untitled recording';
}

export function createSession(options: CreateSessionOptions): RecordingSession {
  const startUrl = redactUrl(options.startUrl);
  const startedAt = options.startedAt.toISOString();
  const session: RecordingSession = {
    id: options.id,
    name: options.name ?? defaultRecordingName(startUrl),
    startedAt,
    startUrl,
    actions: [],
    nextSequence: 1,
  };
  return appendDraft(session, {
    type: 'navigate',
    trigger: 'initial',
    url: startUrl,
    title: options.startTitle,
    timestamp: startedAt,
  }).session;
}

function isRedundantNavigation(draft: ActionDraft, last: RecordedAction | undefined): boolean {
  if (draft.type !== 'navigate' || !last || draft.trigger === 'reload') return false;
  if (draft.url !== last.url) return false;
  // A same-URL navigation right after another navigation, or a history/fragment update that
  // does not change the URL, carries no new information.
  return (
    last.type === 'navigate' || draft.trigger === 'history_api' || draft.trigger === 'fragment'
  );
}

/**
 * Adds a captured draft to the session, returning a new session (inputs are not mutated).
 *
 * Rules, applied in order:
 * 1. An input draft whose `coalesceKey` matches the previous input action replaces that
 *    action's value and target, keeping its id and original timestamp.
 * 2. A navigation to the URL the session is already on is skipped (except reloads).
 * 3. Anything else is appended with the next sequential id.
 */
export function appendDraft(
  session: RecordingSession,
  draft: ActionDraft,
  options: AppendOptions = {},
): AppendResult {
  const safeDraft: ActionDraft = { ...draft, url: redactUrl(draft.url) };
  const last = session.actions.at(-1);

  if (
    safeDraft.type === 'input' &&
    last?.type === 'input' &&
    options.coalesceKey !== undefined &&
    options.coalesceKey === session.lastCoalesceKey
  ) {
    const merged: RecordedAction = {
      ...safeDraft,
      id: last.id,
      timestamp: last.timestamp,
    };
    return {
      session: { ...session, actions: [...session.actions.slice(0, -1), merged] },
      outcome: 'merged',
    };
  }

  if (isRedundantNavigation(safeDraft, last)) {
    return { session, outcome: 'skipped' };
  }

  const action: RecordedAction = { ...safeDraft, id: formatActionId(session.nextSequence) };
  const next: RecordingSession = {
    ...session,
    actions: [...session.actions, action],
    nextSequence: session.nextSequence + 1,
  };
  if (safeDraft.type === 'input' && options.coalesceKey !== undefined) {
    next.lastCoalesceKey = options.coalesceKey;
  } else {
    delete next.lastCoalesceKey;
  }
  return { session: next, outcome: 'appended' };
}

/**
 * Fills in the title of the most recent navigation to `url` once the page reports it.
 * Navigation events fire before the document exists, so their title is initially empty.
 */
export function applyPageTitle(
  session: RecordingSession,
  url: string,
  title: string,
): RecordingSession {
  const safeUrl = redactUrl(url);
  for (let i = session.actions.length - 1; i >= 0; i--) {
    const action = session.actions[i];
    if (action?.type !== 'navigate') continue;
    if (action.url !== safeUrl || action.title !== '') return session;
    const actions = [...session.actions];
    actions[i] = { ...action, title };
    return { ...session, actions };
  }
  return session;
}

export interface FinalizeOptions {
  endedAt: Date;
  recorder: RecorderInfo;
}

export function finalizeSession(
  session: RecordingSession,
  options: FinalizeOptions,
): RecordingDocument {
  return {
    version: RECORDING_SCHEMA_VERSION,
    workflow: {
      id: session.id,
      name: session.name,
      createdAt: session.startedAt,
      endedAt: options.endedAt.toISOString(),
      startUrl: session.startUrl,
    },
    recorder: options.recorder,
    actions: session.actions,
  };
}
