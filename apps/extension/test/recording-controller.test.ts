import { validateRecording } from '@webweaver/workflow-schema';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  RecordingController,
  isRecordableUrl,
  type RecordingControllerDeps,
} from '../src/background/recording-controller';
import { MemoryStateStore } from '../src/background/state-store';
import { clickCapture, FakeBrowser, inputCapture } from './fakes';

const TAB = 7;
const START_URL = 'https://example.com/login?session_token=abc123';

describe('RecordingController', () => {
  let browser: FakeBrowser;
  let store: MemoryStateStore;
  let clock: number;

  function makeController(overrides: Partial<RecordingControllerDeps> = {}) {
    return new RecordingController({
      store,
      browser,
      recorder: { name: 'webweaver-extension', version: '0.1.0-test' },
      now: () => new Date(clock),
      newId: () => 'wf-test',
      ...overrides,
    });
  }

  beforeEach(() => {
    browser = new FakeBrowser();
    browser.addTab({ id: TAB, url: START_URL, title: 'Login' });
    store = new MemoryStateStore();
    clock = Date.parse('2026-09-29T05:00:00.000Z');
  });

  it('starts idle', async () => {
    expect(await makeController().getStatus()).toEqual({
      state: 'idle',
      actionCount: 0,
      recentActions: [],
    });
  });

  it('starts recording with a redacted initial navigation and notifies the tab', async () => {
    const controller = makeController();
    const status = await controller.start(TAB);

    expect(status).toMatchObject({
      state: 'recording',
      tabId: TAB,
      startUrl: 'https://example.com/login?session_token={{API_TOKEN}}',
      actionCount: 1,
      recentActions: [
        {
          id: 'action-001',
          description: 'Navigate to https://example.com/login?session_token={{API_TOKEN}}',
        },
      ],
    });
    expect(browser.sent).toEqual([{ tabId: TAB, command: { type: 'recorder/start' } }]);
    expect(browser.injected).toEqual([]);
    expect(browser.indicator.get(TAB)).toBe(true);
    expect(await controller.isRecordingTab(TAB)).toBe(true);
    expect(await controller.isRecordingTab(99)).toBe(false);
  });

  it('injects the content script into tabs without a live one (e.g. after an extension reload)', async () => {
    browser.listening.delete(TAB);
    await makeController().start(TAB);
    expect(browser.injected).toEqual([TAB]);
  });

  it('rolls back when the recorder cannot be attached', async () => {
    browser.listening.delete(TAB);
    browser.injectionError = new Error('Cannot access contents of the page.');
    const controller = makeController();
    await expect(controller.start(TAB)).rejects.toThrow(
      'Could not attach the recorder to this page: Cannot access contents of the page.',
    );
    expect((await controller.getStatus()).state).toBe('idle');
  });

  it('refuses pages that cannot be recorded', async () => {
    browser.addTab({ id: 8, url: 'chrome://extensions/' });
    await expect(makeController().start(8)).rejects.toThrow('Only http:// and https://');
    await expect(makeController().start(404)).rejects.toThrow('no longer exists');
  });

  it('is idempotent for the same tab but refuses a second tab', async () => {
    browser.addTab({ id: 8, url: 'https://other.test/' });
    const controller = makeController();
    await controller.start(TAB);
    await expect(controller.start(TAB)).resolves.toMatchObject({ state: 'recording' });
    await expect(controller.start(8)).rejects.toThrow('Already recording another tab');
  });

  it('records captures only from the top frame of the recorded tab', async () => {
    const controller = makeController();
    await controller.start(TAB);
    expect(await controller.handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'))).toBe(true);
    expect(await controller.handleCapture(TAB, 3, clickCapture('2026-09-29T05:00:02Z'))).toBe(
      false,
    );
    expect(await controller.handleCapture(99, 0, clickCapture('2026-09-29T05:00:03Z'))).toBe(false);
    expect((await controller.getStatus()).actionCount).toBe(2);
  });

  it('ignores captures when not recording', async () => {
    const controller = makeController();
    expect(await controller.handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'))).toBe(
      false,
    );
  });

  it('coalesces keystrokes into a single input action', async () => {
    const controller = makeController();
    await controller.start(TAB);
    for (const [i, value] of ['a', 'al', 'ali', 'alice'].entries()) {
      await controller.handleCapture(TAB, 0, inputCapture(value, `2026-09-29T05:00:0${i + 1}Z`));
    }
    const recording = await controller.stop();
    expect(recording.actions.map((a) => a.type)).toEqual(['navigate', 'input']);
    expect(recording.actions[1]).toMatchObject({ value: 'alice' });
  });

  it('records top-frame navigations with their trigger and fills titles from page info', async () => {
    const controller = makeController();
    await controller.start(TAB);
    await controller.handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'));
    await controller.handleNavigation({
      kind: 'committed',
      tabId: TAB,
      frameId: 0,
      url: 'https://example.com/dashboard',
      timeStamp: Date.parse('2026-09-29T05:00:02Z'),
      transitionType: 'form_submit',
      transitionQualifiers: ['server_redirect'],
    });
    await controller.handleNavigation({
      kind: 'committed',
      tabId: TAB,
      frameId: 5,
      url: 'https://ads.example/iframe',
      timeStamp: Date.parse('2026-09-29T05:00:02Z'),
      transitionType: 'auto_subframe',
    });
    await controller.handlePageInfo(TAB, 0, 'https://example.com/dashboard', 'Dashboard');

    const recording = await controller.stop();
    expect(recording.actions.at(-1)).toEqual({
      id: 'action-003',
      type: 'navigate',
      trigger: 'form_submit',
      url: 'https://example.com/dashboard',
      title: 'Dashboard',
      timestamp: '2026-09-29T05:00:02.000Z',
    });
    expect(recording.actions).toHaveLength(3);
  });

  it('stop produces a valid recording, keeps it as the last recording and notifies the tab', async () => {
    const controller = makeController();
    await controller.start(TAB);
    await controller.handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'));
    clock = Date.parse('2026-09-29T05:05:00.000Z');
    const recording = await controller.stop();

    expect(validateRecording(recording)).toEqual({ valid: true, recording });
    expect(recording.workflow).toEqual({
      id: 'wf-test',
      name: 'Recording of example.com',
      createdAt: '2026-09-29T05:00:00.000Z',
      endedAt: '2026-09-29T05:05:00.000Z',
      startUrl: 'https://example.com/login?session_token={{API_TOKEN}}',
    });
    expect(recording.recorder).toEqual({ name: 'webweaver-extension', version: '0.1.0-test' });
    expect(JSON.stringify(recording)).not.toContain('abc123');

    expect(browser.sent.at(-1)).toEqual({ tabId: TAB, command: { type: 'recorder/stop' } });
    expect(browser.indicator.get(TAB)).toBe(false);
    expect(await controller.getLastRecording()).toEqual(recording);
    expect(await controller.getStatus()).toMatchObject({
      state: 'idle',
      lastRecording: {
        name: 'Recording of example.com',
        actionCount: 2,
        fileName: 'recording-example.com-20260929-050000.json',
      },
    });
  });

  it('stop fails clearly when nothing is being recorded', async () => {
    await expect(makeController().stop()).rejects.toThrow('No recording is in progress.');
  });

  it('can record again after stopping', async () => {
    const controller = makeController();
    await controller.start(TAB);
    await controller.stop();
    await controller.start(TAB);
    await controller.handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'));
    const second = await controller.stop();
    expect(second.actions.map((a) => a.id)).toEqual(['action-001', 'action-002']);
  });

  it('survives a service-worker restart mid-recording', async () => {
    await makeController().start(TAB);
    await makeController().handleCapture(TAB, 0, clickCapture('2026-09-29T05:00:01Z'));

    const restarted = makeController();
    await restarted.handleCapture(TAB, 0, inputCapture('x', '2026-09-29T05:00:02Z'));
    const recording = await restarted.stop();
    expect(recording.actions.map((a) => a.type)).toEqual(['navigate', 'click', 'input']);
  });

  it('serializes concurrent captures without losing any', async () => {
    const controller = makeController();
    await controller.start(TAB);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        controller.handleCapture(
          TAB,
          0,
          clickCapture(`2026-09-29T05:00:${String(i).padStart(2, '0')}Z`),
        ),
      ),
    );
    expect((await controller.getStatus()).actionCount).toBe(21);
  });

  it('finishes the recording when the recorded tab is closed', async () => {
    const controller = makeController();
    await controller.start(TAB);
    await controller.handleTabRemoved(99);
    expect((await controller.getStatus()).state).toBe('recording');
    await controller.handleTabRemoved(TAB);
    expect((await controller.getStatus()).state).toBe('idle');
    expect(await controller.getLastRecording()).toBeDefined();
  });
});

describe('isRecordableUrl', () => {
  it('accepts only http(s) URLs', () => {
    expect(isRecordableUrl('https://example.com')).toBe(true);
    expect(isRecordableUrl('HTTP://example.com')).toBe(true);
    expect(isRecordableUrl('chrome://settings')).toBe(false);
    expect(isRecordableUrl('file:///tmp/x.html')).toBe(false);
    expect(isRecordableUrl(undefined)).toBe(false);
  });
});
