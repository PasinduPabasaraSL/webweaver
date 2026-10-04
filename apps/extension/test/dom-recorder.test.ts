import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Capture } from '../src/recorder/capture';
import { DomRecorder } from '../src/recorder/dom-recorder';
import { click, mount, typeInto } from './helpers';

const LOGIN_FORM = `
  <form id="login-form">
    <label for="username">Username</label>
    <input id="username" name="username">
    <label for="password">Password</label>
    <input id="password" name="password" type="password">
    <label id="remember-label"><input id="remember" type="checkbox"> Remember me</label>
    <button id="login" data-testid="login-button" type="button"><span class="icon"></span>Log in</button>
  </form>`;

describe('DomRecorder', () => {
  let captures: Capture[];
  let clock: number;
  let recorder: DomRecorder;

  beforeEach(() => {
    captures = [];
    clock = Date.parse('2026-09-29T05:00:00.000Z');
    document.title = 'Login';
    recorder = new DomRecorder({
      document,
      sink: (capture) => captures.push(capture),
      now: () => new Date(clock),
      acceptEvent: () => true,
      keyPrefix: 'test',
    });
  });

  afterEach(() => recorder.stop());

  it('records nothing until started', () => {
    const $ = mount(LOGIN_FORM);
    click($('#login'));
    expect(captures).toEqual([]);
  });

  it('records a click on the interactive ancestor with page context and element metadata', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    click($('#login .icon'), { shiftKey: true });

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      draft: {
        type: 'click',
        url: document.location.href,
        title: 'Login',
        timestamp: '2026-09-29T05:00:00.000Z',
        modifiers: { alt: false, ctrl: false, meta: false, shift: true },
        target: {
          element: {
            tagName: 'button',
            id: 'login',
            text: 'Log in',
            dataAttributes: { 'data-testid': 'login-button' },
            cssSelector: '#login',
          },
        },
      },
    });
    expect(captures[0]?.coalesceKey).toBeUndefined();
  });

  it('emits one input capture per keystroke with a stable coalesce key', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    typeInto($('#username'), 'hello');

    expect(captures.map((c) => c.draft.type === 'input' && c.draft.value)).toEqual([
      'h',
      'he',
      'hel',
      'hell',
      'hello',
    ]);
    const keys = new Set(captures.map((c) => c.coalesceKey));
    expect(keys).toEqual(new Set(['test:1']));
  });

  it('assigns different coalesce keys to different fields', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    typeInto($('#username'), 'a');
    typeInto($('#password'), 'b');
    expect(captures.map((c) => c.coalesceKey)).toEqual(['test:1', 'test:2']);
  });

  it('replaces password input with a variable and records why', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    typeInto($('#password'), 'hunter2');

    const last = captures.at(-1)?.draft;
    expect(last).toMatchObject({
      type: 'input',
      value: '{{PASSWORD}}',
      redaction: { variable: 'PASSWORD', reason: 'input type is "password"' },
    });
    expect(JSON.stringify(captures)).not.toContain('hunter');
  });

  it('records checkbox toggles as clicks, not inputs', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    const checkbox = $<HTMLInputElement>('#remember');
    click(checkbox);
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    expect(captures.map((c) => c.draft.type)).toEqual(['click']);
  });

  it('records a label click once, ignoring the click the browser forwards to its control', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    click($('#remember-label'));
    // jsdom, like browsers, dispatches the forwarded click on the checkbox itself.
    const clicked = captures.map((c) => c.draft.type === 'click' && c.draft.target.element.id);
    expect(clicked).toEqual(['remember-label']);

    clock += 1000;
    click($('#remember'));
    expect(captures).toHaveLength(2);
  });

  it('ignores untrusted (script-dispatched) events by default', () => {
    const $ = mount(LOGIN_FORM);
    const strict = new DomRecorder({ document, sink: (c) => captures.push(c) });
    strict.start();
    click($('#login'));
    typeInto($('#username'), 'x');
    strict.stop();
    expect(captures).toEqual([]);
  });

  it('records contenteditable text', () => {
    const $ = mount(`<div id="editor" contenteditable="true"><p id="para">Hi</p></div>`);
    recorder.start();
    $('#para').dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(captures[0]?.draft).toMatchObject({
      type: 'input',
      value: 'Hi',
      target: { element: { id: 'editor' } },
    });
  });

  it('stops recording and can be restarted', () => {
    const $ = mount(LOGIN_FORM);
    recorder.start();
    recorder.start();
    click($('#login'));
    recorder.stop();
    click($('#login'));
    recorder.start();
    click($('#login'));
    expect(captures).toHaveLength(2);
    expect(recorder.isActive).toBe(true);
  });
});
