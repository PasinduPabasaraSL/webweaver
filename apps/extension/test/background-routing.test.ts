import { describe, expect, it } from 'vitest';
import { createMessageRouter } from '../src/background/message-router';
import { navigationTrigger, type NavigationEvent } from '../src/background/navigation';
import { RecordingController } from '../src/background/recording-controller';
import { SerialQueue } from '../src/background/serial-queue';
import { MemoryStateStore } from '../src/background/state-store';
import { clickCapture, FakeBrowser } from './fakes';

const EXTENSION_ID = 'ext-id';
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
const POPUP = { id: EXTENSION_ID, url: `${EXTENSION_ORIGIN}popup.html` };
const TAB_SENDER = { id: EXTENSION_ID, url: 'https://example.com/', tab: { id: 1 }, frameId: 0 };

function setup() {
  const browser = new FakeBrowser();
  browser.addTab({ id: 1, url: 'https://example.com/', title: 'Example' });
  const controller = new RecordingController({
    store: new MemoryStateStore(),
    browser,
    recorder: { name: 'test', version: '1' },
  });
  return createMessageRouter(controller, {
    extensionId: EXTENSION_ID,
    extensionOrigin: EXTENSION_ORIGIN,
  });
}

describe('message router', () => {
  it('drives a full recording through messages', async () => {
    const route = setup();
    expect(await route({ type: 'content/get-status' }, TAB_SENDER)).toEqual({
      ok: true,
      data: { recording: false },
    });
    expect(await route({ type: 'popup/start', tabId: 1 }, POPUP)).toMatchObject({
      ok: true,
      data: { state: 'recording' },
    });
    expect(await route({ type: 'content/get-status' }, TAB_SENDER)).toEqual({
      ok: true,
      data: { recording: true },
    });
    expect(
      await route(
        { type: 'content/capture', capture: clickCapture('2026-09-29T05:00:01Z') },
        TAB_SENDER,
      ),
    ).toEqual({ ok: true, data: { accepted: true } });

    const stopped = await route({ type: 'popup/stop' }, POPUP);
    expect(stopped).toMatchObject({ ok: true, data: { version: '1.0' } });
    expect(await route({ type: 'popup/get-last-recording' }, POPUP)).toEqual(stopped);
  });

  it('reports subframes as not recording', async () => {
    const route = setup();
    await route({ type: 'popup/start', tabId: 1 }, POPUP);
    expect(await route({ type: 'content/get-status' }, { ...TAB_SENDER, frameId: 2 })).toEqual({
      ok: true,
      data: { recording: false },
    });
  });

  it('returns null when there is no last recording', async () => {
    expect(await setup()({ type: 'popup/get-last-recording' }, POPUP)).toEqual({
      ok: true,
      data: null,
    });
  });

  it('rejects messages from other extensions', async () => {
    expect(await setup()({ type: 'popup/get-status' }, { id: 'evil' })).toEqual({
      ok: false,
      error: 'Message from an unknown sender.',
    });
  });

  it('does not let content scripts use popup commands, or extension pages use content ones', async () => {
    const route = setup();
    expect(await route({ type: 'popup/stop' }, TAB_SENDER)).toEqual({
      ok: false,
      error: 'Popup requests must come from an extension page.',
    });
    expect(await route({ type: 'content/get-status' }, POPUP)).toEqual({
      ok: false,
      error: 'Content requests must come from a web page.',
    });
  });

  it('accepts popup requests from an extension page opened in a tab', async () => {
    const popupInTab = { ...POPUP, tab: { id: 9 }, frameId: 0 };
    expect(await setup()({ type: 'popup/get-status' }, popupInTab)).toMatchObject({ ok: true });
    expect(await setup()({ type: 'content/get-status' }, popupInTab)).toMatchObject({ ok: false });
  });

  it('rejects malformed messages', async () => {
    const route = setup();
    for (const message of [
      null,
      'popup/stop',
      { type: 'popup/start' },
      { type: 'popup/start', tabId: 'x' },
      { type: 'content/capture', capture: { draft: { type: 'hover' } } },
      { type: 'content/page-info', url: 1 },
      { type: 'nope' },
    ]) {
      for (const sender of [POPUP, TAB_SENDER]) {
        expect(await route(message, sender)).toEqual({
          ok: false,
          error: 'Unsupported or malformed message.',
        });
      }
    }
  });

  it('turns controller errors into error responses', async () => {
    expect(await setup()({ type: 'popup/stop' }, POPUP)).toEqual({
      ok: false,
      error: 'No recording is in progress.',
    });
  });
});

describe('navigationTrigger', () => {
  const base: NavigationEvent = {
    kind: 'committed',
    tabId: 1,
    frameId: 0,
    url: 'https://x.test/',
    timeStamp: 0,
  };

  it('maps Chrome transition types and qualifiers', () => {
    const cases: [Partial<NavigationEvent>, string][] = [
      [{ transitionType: 'link' }, 'link'],
      [{ transitionType: 'typed' }, 'typed'],
      [{ transitionType: 'generated' }, 'typed'],
      [{ transitionType: 'form_submit' }, 'form_submit'],
      [{ transitionType: 'reload', transitionQualifiers: ['from_address_bar'] }, 'reload'],
      [{ transitionType: 'link', transitionQualifiers: ['forward_back'] }, 'back_forward'],
      [{ transitionType: 'link', transitionQualifiers: ['client_redirect'] }, 'redirect'],
      [{ transitionType: 'link', transitionQualifiers: ['from_address_bar'] }, 'typed'],
      [{ transitionType: 'auto_toplevel' }, 'other'],
      [{ kind: 'history' }, 'history_api'],
      [{ kind: 'fragment' }, 'fragment'],
    ];
    for (const [event, trigger] of cases) {
      expect(navigationTrigger({ ...base, ...event })).toBe(trigger);
    }
  });
});

describe('SerialQueue', () => {
  it('runs tasks one at a time in order, even when some fail', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) =>
      queue.run(async () => {
        log.push(`start ${name}`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        log.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      });

    const results = await Promise.allSettled([task('a', 20), task('b', 1, true), task('c', 1)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
});
