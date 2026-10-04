import type { RecordedAction, RecordingDocument } from '@webweaver/workflow-schema';
import { describe, expect, it } from 'vitest';
import { describeAction, describeElement, recordingFileName, serializeRecording } from '../src';
import { clickDraft, inputDraft, snapshot } from './fixtures';

describe('describeElement', () => {
  it('prefers label, then text, aria-label and placeholder', () => {
    expect(describeElement(snapshot({ label: 'Email', text: 'x' }))).toBe('input "Email"');
    expect(describeElement(snapshot({ tagName: 'button', text: 'Log in' }))).toBe(
      'button "Log in"',
    );
    expect(describeElement(snapshot({ ariaAttributes: { 'aria-label': 'Close' } }))).toBe(
      'input "Close"',
    );
    expect(describeElement(snapshot({ attributes: { placeholder: 'Search' } }))).toBe(
      'input "Search"',
    );
  });

  it('falls back to id, name and tag', () => {
    expect(describeElement(snapshot({ id: 'q' }))).toBe('input #q');
    expect(describeElement(snapshot({ name: 'q' }))).toBe('input [name=q]');
    expect(describeElement(snapshot({ tagName: 'div' }))).toBe('div');
  });
});

describe('describeAction', () => {
  it('summarizes each action type', () => {
    const actions: RecordedAction[] = [
      {
        id: 'action-001',
        type: 'navigate',
        trigger: 'initial',
        url: 'https://example.com/',
        title: '',
        timestamp: '2026-09-29T05:00:00Z',
      },
      { ...clickDraft('2026-09-29T05:00:01Z'), id: 'action-002' },
      { ...inputDraft('{{PASSWORD}}', '2026-09-29T05:00:02Z'), id: 'action-003' },
    ];
    expect(actions.map(describeAction)).toEqual([
      'Navigate to https://example.com/',
      'Click button "Log in"',
      'Fill input #username with "{{PASSWORD}}"',
    ]);
  });
});

describe('export', () => {
  const recording: RecordingDocument = {
    version: '1.0',
    workflow: {
      id: 'wf',
      name: 'Recording of Example.COM',
      createdAt: '2026-09-29T05:32:42.123Z',
      endedAt: '2026-09-29T05:40:00.000Z',
      startUrl: 'https://Example.COM:8443/login',
    },
    recorder: { name: 'test', version: '1' },
    actions: [],
  };

  it('builds a deterministic file name from host and start time', () => {
    expect(recordingFileName(recording)).toBe('recording-example.com-20260929-053242.json');
  });

  it('serializes as pretty-printed JSON with a trailing newline', () => {
    const json = serializeRecording(recording);
    expect(json.endsWith('}\n')).toBe(true);
    expect(JSON.parse(json)).toEqual(recording);
  });

  it('writes keys in canonical order but keeps recorded attribute maps verbatim', () => {
    // Keys deliberately scrambled, as chrome.storage returns them alphabetically sorted.
    const scrambled = {
      actions: [
        {
          url: 'https://example.com/',
          type: 'click',
          title: '',
          timestamp: '2026-09-29T05:00:00Z',
          target: {
            element: {
              xpath: '/html/body/button',
              tagName: 'button',
              classes: [],
              attributes: { type: 'button', name: 'go' },
              ariaAttributes: {},
              dataAttributes: {},
            },
          },
          modifiers: { shift: false, meta: false, ctrl: false, alt: false },
          id: 'action-001',
        },
      ],
      workflow: recording.workflow,
      recorder: recording.recorder,
      version: '1.0',
    } as unknown as RecordingDocument;

    const parsed = JSON.parse(serializeRecording(scrambled)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['version', 'workflow', 'recorder', 'actions']);
    const action = (parsed['actions'] as Record<string, unknown>[])[0]!;
    expect(Object.keys(action)).toEqual([
      'id',
      'type',
      'timestamp',
      'url',
      'title',
      'modifiers',
      'target',
    ]);
    const element = (action['target'] as { element: Record<string, unknown> }).element;
    expect(Object.keys(element).slice(0, 2)).toEqual(['tagName', 'classes']);
    expect(Object.keys(element['attributes'] as object)).toEqual(['type', 'name']);
  });
});
