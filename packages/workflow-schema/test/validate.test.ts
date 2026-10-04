import { describe, expect, it } from 'vitest';
import { RECORDING_SCHEMA_VERSION, validateRecording, type RecordingDocument } from '../src';

function element() {
  return {
    tagName: 'button',
    id: 'login',
    classes: ['btn'],
    ariaAttributes: {},
    dataAttributes: { 'data-testid': 'login-button' },
    attributes: { type: 'submit' },
    boundingBox: { x: 1, y: 2, width: 30, height: 10 },
  };
}

function validRecording(): RecordingDocument {
  return {
    version: RECORDING_SCHEMA_VERSION,
    workflow: {
      id: 'wf-1',
      name: 'Login',
      createdAt: '2026-09-29T05:00:00.000Z',
      endedAt: '2026-09-29T05:01:00.000Z',
      startUrl: 'https://example.com/login',
    },
    recorder: { name: 'webweaver-extension', version: '0.1.0' },
    actions: [
      {
        id: 'action-001',
        type: 'navigate',
        trigger: 'initial',
        url: 'https://example.com/login',
        title: 'Login',
        timestamp: '2026-09-29T05:00:00.000Z',
      },
      {
        id: 'action-002',
        type: 'input',
        url: 'https://example.com/login',
        title: 'Login',
        timestamp: '2026-09-29T05:00:01.000Z',
        target: { element: { ...element(), tagName: 'input' } },
        value: '{{PASSWORD}}',
        redaction: { variable: 'PASSWORD', reason: 'input type is "password"' },
      },
      {
        id: 'action-003',
        type: 'click',
        url: 'https://example.com/login',
        title: 'Login',
        timestamp: '2026-09-29T05:00:02.000Z',
        target: { element: element() },
        modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      },
    ],
  };
}

describe('validateRecording', () => {
  it('accepts a well-formed recording', () => {
    const result = validateRecording(validRecording());
    expect(result).toEqual({ valid: true, recording: validRecording() });
  });

  it('accepts a recording that survived a JSON round trip', () => {
    const result = validateRecording(JSON.parse(JSON.stringify(validRecording())));
    expect(result.valid).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(validateRecording(null)).toEqual({ valid: false, errors: ['$: must be an object'] });
    expect(validateRecording([])).toMatchObject({ valid: false });
  });

  it('rejects an unsupported schema version', () => {
    const result = validateRecording({ ...validRecording(), version: '2.0' });
    expect(result).toEqual({ valid: false, errors: ['$.version: must be "1.0"'] });
  });

  it('reports every problem with a JSON path', () => {
    const recording = validRecording() as unknown as Record<string, unknown>;
    const actions = recording['actions'] as Record<string, unknown>[];
    actions[0]!['trigger'] = 'teleport';
    actions[1]!['value'] = 42;
    actions[2]!['target'] = { element: { tagName: '', classes: 'x' } };
    const result = validateRecording(recording);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\$\.actions\[0\]\.trigger: must be one of/),
        '$.actions[1].value: must be a string',
        '$.actions[2].target.element.tagName: must be a non-empty string',
        '$.actions[2].target.element.classes: must be an array of strings',
        '$.actions[2].target.element.ariaAttributes: must be an object of string values',
      ]),
    );
  });

  it('rejects unknown action types and duplicate ids', () => {
    const recording = validRecording();
    const actions = recording.actions as unknown as Record<string, unknown>[];
    actions.push({ ...actions[0], type: 'hover' });
    const result = validateRecording(recording);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors).toContain('$.actions[3].type: must be one of navigate, click, input');
    expect(result.errors).toContain('$.actions[3].id: must be unique');
  });

  it('requires valid timestamps', () => {
    const recording = validRecording();
    recording.workflow.createdAt = 'yesterday';
    const result = validateRecording(recording);
    expect(result).toEqual({
      valid: false,
      errors: ['$.workflow.createdAt: must be an ISO-8601 timestamp'],
    });
  });
});
