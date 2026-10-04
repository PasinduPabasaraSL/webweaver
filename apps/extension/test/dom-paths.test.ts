import { describe, expect, it } from 'vitest';
import { cssEscape } from '../src/dom/css-escape';
import { buildCssPath, buildParentPath } from '../src/dom/css-path';
import { getLabel } from '../src/dom/label';
import { getRole } from '../src/dom/role';
import { buildXPath } from '../src/dom/xpath';
import { mount } from './helpers';

describe('cssEscape', () => {
  it('matches CSS.escape for tricky identifiers', () => {
    expect(cssEscape('login')).toBe('login');
    expect(cssEscape('1st')).toBe('\\31 st');
    expect(cssEscape('-1a')).toBe('-\\31 a');
    expect(cssEscape('-')).toBe('\\-');
    expect(cssEscape('a.b:c')).toBe('a\\.b\\:c');
    expect(cssEscape('ünï')).toBe('ünï');
  });
});

describe('buildCssPath', () => {
  it('anchors at the nearest unique id and uses nth-of-type only when needed', () => {
    const $ = mount(`
      <main id="app">
        <form>
          <input name="a"><input name="b">
          <button>Go</button>
        </form>
      </main>`);
    expect(buildCssPath($('input[name="b"]'))).toBe('#app > form > input:nth-of-type(2)');
    expect(buildCssPath($('button'))).toBe('#app > form > button');
  });

  it('ignores duplicated ids and escapes ids that need it', () => {
    const $ = mount(`<div id="dup"><span id="dup"></span></div><p id="1x"></p>`);
    expect(buildCssPath($('span'))).toBe('html > body > div > span');
    expect(buildCssPath($('p'))).toBe('#\\31 x');
  });

  it('produces selectors that resolve back to the element', () => {
    const $ = mount(`<ul><li>a</li><li>b</li><li><a href="#">c</a></li></ul>`);
    const link = $('a');
    expect(document.querySelector(buildCssPath(link))).toBe(link);
  });
});

describe('buildXPath', () => {
  it('builds an absolute, index-based path that resolves to the element', () => {
    const $ = mount(`<div></div><div><p>a</p><p>b</p></div>`);
    const second = $('div:nth-of-type(2) p:nth-of-type(2)');
    const xpath = buildXPath(second);
    expect(xpath).toBe('/html/body/div[2]/p[2]');
    const found = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
    expect(found.singleNodeValue).toBe(second);
  });

  it('uses local-name() steps for SVG elements', () => {
    const $ = mount(`<button><svg><path d="M0"></path></svg></button>`);
    expect(buildXPath($('path'))).toBe(
      '/html/body/button/*[local-name()="svg"]/*[local-name()="path"]',
    );
  });
});

describe('buildParentPath', () => {
  it('describes ancestors with ids and up to two classes', () => {
    const $ = mount(`<div id="app" class="a b c"><form class="login"><input></form></div>`);
    expect(buildParentPath($('input'))).toBe('html > body > div#app.a.b > form.login');
  });
});

describe('getRole', () => {
  it('prefers the explicit role and falls back to implicit roles', () => {
    const $ = mount(`
      <div role="tab button" id="tab"></div>
      <a id="link" href="/x">x</a><a id="anchor">y</a>
      <input id="email" type="email"><input id="check" type="checkbox"><input id="combo" list="l">
      <select id="single"></select><select id="multi" multiple></select>
      <img id="deco" alt=""><h2 id="h">t</h2>`);
    expect(getRole($('#tab'))).toBe('tab');
    expect(getRole($('#link'))).toBe('link');
    expect(getRole($('#anchor'))).toBeUndefined();
    expect(getRole($('#email'))).toBe('textbox');
    expect(getRole($('#check'))).toBe('checkbox');
    expect(getRole($('#combo'))).toBe('combobox');
    expect(getRole($('#single'))).toBe('combobox');
    expect(getRole($('#multi'))).toBe('listbox');
    expect(getRole($('#deco'))).toBe('presentation');
    expect(getRole($('#h'))).toBe('heading');
  });
});

describe('getLabel', () => {
  it('follows accessible-name precedence', () => {
    const $ = mount(`
      <span id="l1">Primary</span><span id="l2">email</span>
      <input id="a" aria-labelledby="l1 l2" aria-label="ignored">
      <input id="b" aria-label="Search site">
      <label for="c">Username</label><input id="c">
      <label>Remember me <input id="d" type="checkbox"></label>
      <img id="e" alt="Logo">
      <button id="f" title="Close"></button>
      <input id="g">`);
    expect(getLabel($('#a'))).toBe('Primary email');
    expect(getLabel($('#b'))).toBe('Search site');
    expect(getLabel($('#c'))).toBe('Username');
    expect(getLabel($('#d'))).toBe('Remember me');
    expect(getLabel($('#e'))).toBe('Logo');
    expect(getLabel($('#f'))).toBe('Close');
    expect(getLabel($('#g'))).toBeUndefined();
  });
});
