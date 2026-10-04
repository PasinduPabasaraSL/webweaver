import { describe, expect, it } from 'vitest';
import { createElementSnapshot } from '../src/dom/element-snapshot';
import { resolveEditableTarget, resolveInteractiveTarget } from '../src/dom/interactive-target';
import { mount } from './helpers';

describe('createElementSnapshot', () => {
  it('captures semantic metadata of a button', () => {
    const $ = mount(`
      <form id="login-form">
        <button id="login" class="btn btn-primary" type="submit" name="go"
                data-testid="login-button" aria-describedby="hint">
          Log   in
        </button>
      </form>`);
    const snapshot = createElementSnapshot($('#login'));

    expect(snapshot).toMatchObject({
      tagName: 'button',
      id: 'login',
      name: 'go',
      type: 'submit',
      text: 'Log in',
      classes: ['btn', 'btn-primary'],
      role: 'button',
      ariaAttributes: { 'aria-describedby': 'hint' },
      dataAttributes: { 'data-testid': 'login-button' },
      attributes: { type: 'submit', name: 'go' },
      cssSelector: '#login',
      xpath: '/html/body/form/button',
      parentPath: 'html > body > form#login-form',
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
    });
    expect(snapshot.attributes).not.toHaveProperty('id');
    expect(snapshot.attributes).not.toHaveProperty('class');
    expect(snapshot.outerHTML).toBe(
      '<button id="login" class="btn btn-primary" type="submit" name="go" data-testid="login-button" aria-describedby="hint"> Log in </button>',
    );
    expect(snapshot.redacted).toBeUndefined();
  });

  it('captures the current value and label of a text input', () => {
    const $ = mount(`<label for="user">Username</label><input id="user" name="username">`);
    const input = $<HTMLInputElement>('#user');
    input.value = 'alice';
    const snapshot = createElementSnapshot(input);
    expect(snapshot).toMatchObject({ value: 'alice', label: 'Username', role: 'textbox' });
    expect(snapshot.text).toBeUndefined();
  });

  it('never exposes password values in value, attributes or outerHTML', () => {
    const $ = mount(`<input id="pw" type="password" name="password" value="default-secret">`);
    const input = $<HTMLInputElement>('#pw');
    input.value = 'typed-secret';
    const snapshot = createElementSnapshot(input);

    expect(snapshot.value).toBe('{{PASSWORD}}');
    expect(snapshot.attributes['value']).toBe('{{PASSWORD}}');
    expect(snapshot.redacted).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/secret/);
  });

  it('scrubs hidden and secret descendants from a container outerHTML', () => {
    const $ = mount(`
      <form id="f">
        <input type="hidden" name="csrf" value="csrf-abc">
        <input type="password" value="pw-abc">
        <textarea name="api_token">tok-abc</textarea>
        <button>Send</button>
      </form>`);
    const snapshot = createElementSnapshot($('#f'));
    expect(snapshot.outerHTML).toContain('value="{{REDACTED}}"');
    expect(snapshot.outerHTML).toContain('value="{{PASSWORD}}"');
    expect(snapshot.outerHTML).toContain('<textarea name="api_token"></textarea>');
    expect(snapshot.outerHTML).not.toMatch(/csrf-abc|pw-abc|tok-abc/);
  });

  it('truncates long text and HTML deterministically', () => {
    const $ = mount(`<div id="big">${'word '.repeat(2000)}</div>`);
    const snapshot = createElementSnapshot($('#big'), {
      text: 20,
      value: 20,
      attribute: 20,
      html: 50,
    });
    expect(snapshot.text).toHaveLength(20);
    expect(snapshot.text?.endsWith('…')).toBe(true);
    expect(snapshot.outerHTML).toHaveLength(51);
    expect(snapshot.outerHTML?.endsWith('…')).toBe(true);
  });

  it('skips script and style contents', () => {
    const $ = mount(`<div id="w"><style>.x{}</style><script>var t = 1;</script>ok</div>`);
    expect(createElementSnapshot($('#w')).outerHTML).toBe(
      '<div id="w"><style></style><script></script>ok</div>',
    );
  });
});

describe('resolveInteractiveTarget', () => {
  it('climbs from an inner node to the interactive ancestor', () => {
    const $ = mount(
      `<a href="/x"><span><svg><path></path></svg></span></a><div><b>plain</b></div>`,
    );
    expect(resolveInteractiveTarget($('path')).localName).toBe('a');
    expect(resolveInteractiveTarget($('b')).localName).toBe('b');
  });
});

describe('resolveEditableTarget', () => {
  it('accepts text-like controls and contenteditable hosts', () => {
    const $ = mount(`
      <input id="t"><input id="c" type="checkbox"><input id="f" type="file">
      <textarea id="ta"></textarea><select id="s"></select>
      <div id="ed" contenteditable="true"><p id="inner">x</p></div>
      <div contenteditable="true"><span id="off" contenteditable="false">y</span></div>`);
    expect(resolveEditableTarget($('#t'))?.id).toBe('t');
    expect(resolveEditableTarget($('#c'))).toBeUndefined();
    expect(resolveEditableTarget($('#f'))).toBeUndefined();
    expect(resolveEditableTarget($('#ta'))?.id).toBe('ta');
    expect(resolveEditableTarget($('#s'))?.id).toBe('s');
    expect(resolveEditableTarget($('#inner'))?.id).toBe('ed');
    expect(resolveEditableTarget($('#off'))).toBeUndefined();
  });
});
