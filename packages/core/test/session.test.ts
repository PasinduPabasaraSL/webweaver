import { validateRecording } from '@webweaver/workflow-schema';
import { describe, expect, it } from 'vitest';
import {
  appendDraft,
  applyPageTitle,
  createSession,
  defaultRecordingName,
  finalizeSession,
  formatActionId,
  type RecordingSession,
} from '../src';
import { clickDraft, inputDraft, navigateDraft, PAGE_URL } from './fixtures';

const START = new Date('2026-09-29T05:00:00.000Z');

function newSession(url = PAGE_URL): RecordingSession {
  return createSession({ id: 'wf-1', startedAt: START, startUrl: url, startTitle: 'Login' });
}

describe('formatActionId', () => {
  it('zero-pads to three digits', () => {
    expect(formatActionId(1)).toBe('action-001');
    expect(formatActionId(42)).toBe('action-042');
    expect(formatActionId(1234)).toBe('action-1234');
  });
});

describe('createSession', () => {
  it('starts with an initial navigation to the start URL', () => {
    const session = newSession();
    expect(session.name).toBe('Recording of example.com');
    expect(session.actions).toEqual([
      {
        id: 'action-001',
        type: 'navigate',
        trigger: 'initial',
        url: PAGE_URL,
        title: 'Login',
        timestamp: '2026-09-29T05:00:00.000Z',
      },
    ]);
    expect(session.nextSequence).toBe(2);
  });

  it('redacts secrets in the start URL', () => {
    const session = newSession('https://example.com/?token=abc');
    expect(session.startUrl).toBe('https://example.com/?token={{API_TOKEN}}');
    expect(session.actions[0]?.url).toBe('https://example.com/?token={{API_TOKEN}}');
  });
});

describe('defaultRecordingName', () => {
  it('uses the host name', () => {
    expect(defaultRecordingName('https://shop.example.com:8080/cart')).toBe(
      'Recording of shop.example.com',
    );
    expect(defaultRecordingName('not a url')).toBe('Untitled recording');
  });
});

describe('appendDraft', () => {
  it('coalesces consecutive keystrokes on the same element into one input action', () => {
    let session = newSession();
    const values = ['h', 'he', 'hel', 'hell', 'hello'];
    const outcomes = values.map((value, i) => {
      const result = appendDraft(session, inputDraft(value, `2026-09-29T05:00:0${i + 1}.000Z`), {
        coalesceKey: 'el:1',
      });
      session = result.session;
      return result.outcome;
    });

    expect(outcomes).toEqual(['appended', 'merged', 'merged', 'merged', 'merged']);
    expect(session.actions).toHaveLength(2);
    expect(session.actions[1]).toMatchObject({
      id: 'action-002',
      type: 'input',
      value: 'hello',
      timestamp: '2026-09-29T05:00:01.000Z',
      target: { element: { value: 'hello' } },
    });
  });

  it('does not coalesce input on different elements', () => {
    let session = newSession();
    session = appendDraft(session, inputDraft('alice', '2026-09-29T05:00:01Z'), {
      coalesceKey: 'el:1',
    }).session;
    session = appendDraft(session, inputDraft('secret', '2026-09-29T05:00:02Z'), {
      coalesceKey: 'el:2',
    }).session;
    expect(session.actions.map((a) => a.id)).toEqual(['action-001', 'action-002', 'action-003']);
  });

  it('starts a new input action after an interleaved action on the same element', () => {
    let session = newSession();
    session = appendDraft(session, inputDraft('a', '2026-09-29T05:00:01Z'), {
      coalesceKey: 'el:1',
    }).session;
    session = appendDraft(session, clickDraft('2026-09-29T05:00:02Z')).session;
    const result = appendDraft(session, inputDraft('ab', '2026-09-29T05:00:03Z'), {
      coalesceKey: 'el:1',
    });
    expect(result.outcome).toBe('appended');
    expect(result.session.actions.map((a) => a.type)).toEqual([
      'navigate',
      'input',
      'click',
      'input',
    ]);
  });

  it('never coalesces drafts without a key', () => {
    let session = newSession();
    session = appendDraft(session, inputDraft('a', '2026-09-29T05:00:01Z')).session;
    const result = appendDraft(session, inputDraft('ab', '2026-09-29T05:00:02Z'));
    expect(result.outcome).toBe('appended');
  });

  it('skips a navigation to the current URL but keeps reloads', () => {
    const session = newSession();
    expect(
      appendDraft(session, navigateDraft(PAGE_URL, 'link', '2026-09-29T05:00:01Z')).outcome,
    ).toBe('skipped');
    expect(
      appendDraft(session, navigateDraft(PAGE_URL, 'reload', '2026-09-29T05:00:01Z')).outcome,
    ).toBe('appended');
  });

  it('skips history updates that do not change the URL', () => {
    let session = newSession();
    session = appendDraft(session, clickDraft('2026-09-29T05:00:01Z')).session;
    expect(
      appendDraft(session, navigateDraft(PAGE_URL, 'history_api', '2026-09-29T05:00:02Z')).outcome,
    ).toBe('skipped');
    expect(
      appendDraft(
        session,
        navigateDraft(`${PAGE_URL}/step-2`, 'history_api', '2026-09-29T05:00:02Z'),
      ).outcome,
    ).toBe('appended');
  });

  it('keeps a same-URL link navigation that follows a click (a real page load)', () => {
    let session = newSession();
    session = appendDraft(session, clickDraft('2026-09-29T05:00:01Z')).session;
    expect(
      appendDraft(session, navigateDraft(PAGE_URL, 'link', '2026-09-29T05:00:02Z')).outcome,
    ).toBe('appended');
  });

  it('redacts draft URLs defensively', () => {
    const session = newSession();
    const result = appendDraft(
      session,
      navigateDraft('https://example.com/cb?access_token=t', 'redirect', '2026-09-29T05:00:01Z'),
    );
    expect(result.session.actions[1]?.url).toBe(
      'https://example.com/cb?access_token={{API_TOKEN}}',
    );
  });

  it('does not mutate the input session', () => {
    const session = newSession();
    const snapshot = JSON.parse(JSON.stringify(session)) as RecordingSession;
    appendDraft(session, clickDraft('2026-09-29T05:00:01Z'));
    expect(session).toEqual(snapshot);
  });
});

describe('applyPageTitle', () => {
  it('fills the empty title of the latest navigation to that URL', () => {
    let session = newSession();
    session = appendDraft(
      session,
      navigateDraft('https://example.com/home', 'form_submit', '2026-09-29T05:00:01Z'),
    ).session;
    const titled = applyPageTitle(session, 'https://example.com/home', 'Home');
    expect(titled.actions[1]).toMatchObject({ type: 'navigate', title: 'Home' });
  });

  it('leaves titles that are already set, or other URLs, untouched', () => {
    const session = newSession();
    expect(applyPageTitle(session, PAGE_URL, 'Other')).toBe(session);
    expect(applyPageTitle(session, 'https://elsewhere.test/', 'Other')).toBe(session);
  });
});

describe('finalizeSession', () => {
  it('produces a valid, versioned recording document', () => {
    let session = newSession();
    session = appendDraft(session, inputDraft('alice', '2026-09-29T05:00:01Z'), {
      coalesceKey: 'el:1',
    }).session;
    session = appendDraft(session, clickDraft('2026-09-29T05:00:02Z')).session;

    const recording = finalizeSession(session, {
      endedAt: new Date('2026-09-29T05:01:00.000Z'),
      recorder: { name: 'test', version: '0.0.1' },
    });

    expect(recording.version).toBe('1.0');
    expect(recording.workflow).toEqual({
      id: 'wf-1',
      name: 'Recording of example.com',
      createdAt: '2026-09-29T05:00:00.000Z',
      endedAt: '2026-09-29T05:01:00.000Z',
      startUrl: PAGE_URL,
    });
    expect(recording.actions.map((a) => a.type)).toEqual(['navigate', 'input', 'click']);
    expect(validateRecording(recording).valid).toBe(true);
  });
});
