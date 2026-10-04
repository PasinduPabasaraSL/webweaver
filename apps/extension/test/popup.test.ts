import { describe, expect, it } from 'vitest';
import type { RecorderStatus } from '../src/messaging/messages';
import { BackgroundError, requestBackground } from '../src/messaging/runtime-client';
import { queryPopupElements, render, showError } from '../src/popup/view';
import { toViewModel } from '../src/popup/view-model';

const NOW = new Date('2026-09-29T05:01:05.000Z');

const RECORDING: RecorderStatus = {
  state: 'recording',
  tabId: 1,
  startUrl: 'https://example.com/login',
  startedAt: '2026-09-29T05:00:00.000Z',
  actionCount: 3,
  recentActions: [
    { id: 'action-002', description: 'Fill input "Username" with "alice"' },
    { id: 'action-003', description: 'Click button "Log in"' },
  ],
};

const IDLE_WITH_LAST: RecorderStatus = {
  state: 'idle',
  actionCount: 0,
  recentActions: [],
  lastRecording: {
    name: 'Recording of example.com',
    actionCount: 5,
    createdAt: '2026-09-29T05:00:00.000Z',
    fileName: 'recording-example.com-20260929-050000.json',
  },
};

describe('toViewModel', () => {
  it('describes an active recording', () => {
    expect(toViewModel(RECORDING, NOW)).toEqual({
      statusLabel: 'Recording',
      isRecording: true,
      detail: 'https://example.com/login\n3 actions · 1:05',
      canStart: false,
      canStop: true,
      canDownload: false,
      downloadLabel: 'Download last recording',
      recentActions: ['Fill input "Username" with "alice"', 'Click button "Log in"'],
    });
  });

  it('offers the last recording when idle', () => {
    expect(toViewModel(IDLE_WITH_LAST, NOW)).toMatchObject({
      statusLabel: 'Idle',
      canStart: true,
      canStop: false,
      canDownload: true,
      downloadLabel: 'Download recording-example.com-20260929-050000.json',
      detail: 'Last: Recording of example.com (5 actions)',
      recentActions: [],
    });
  });

  it('disables every button while busy', () => {
    expect(toViewModel(IDLE_WITH_LAST, NOW, true)).toMatchObject({
      canStart: false,
      canStop: false,
      canDownload: false,
    });
  });

  it('uses the singular for one action', () => {
    expect(toViewModel({ ...RECORDING, actionCount: 1 }, NOW).detail).toContain('1 action ·');
  });
});

describe('popup view', () => {
  function popupDom() {
    document.body.innerHTML = `
      <span id="status"></span><p id="detail"></p>
      <button id="start"></button><button id="stop"></button><button id="download"></button>
      <ol id="actions"></ol><p id="error" hidden></p>`;
    return queryPopupElements(document);
  }

  it('renders the view model into the DOM', () => {
    const elements = popupDom();
    render(elements, toViewModel(RECORDING, NOW));
    expect(elements.status.textContent).toBe('Recording');
    expect(elements.status.dataset['state']).toBe('recording');
    expect(elements.startButton.disabled).toBe(true);
    expect(elements.stopButton.disabled).toBe(false);
    expect(Array.from(elements.actions.children).map((li) => li.textContent)).toEqual(
      RECORDING.recentActions.map((a) => a.description),
    );
    expect(elements.actions.hidden).toBe(false);
  });

  it('shows and clears errors', () => {
    const elements = popupDom();
    showError(elements, 'Boom');
    expect(elements.error.hidden).toBe(false);
    expect(elements.error.textContent).toBe('Boom');
    showError(elements, undefined);
    expect(elements.error.hidden).toBe(true);
  });

  it('fails loudly when markup is missing', () => {
    document.body.innerHTML = '';
    expect(() => queryPopupElements(document)).toThrow('Popup markup is missing #status.');
  });
});

describe('requestBackground', () => {
  it('unwraps successful responses', async () => {
    const data = await requestBackground({ type: 'popup/get-status' }, () =>
      Promise.resolve({ ok: true, data: IDLE_WITH_LAST }),
    );
    expect(data).toEqual(IDLE_WITH_LAST);
  });

  it('throws background errors and missing responses', async () => {
    await expect(
      requestBackground({ type: 'popup/stop' }, () =>
        Promise.resolve({ ok: false, error: 'Nope' }),
      ),
    ).rejects.toThrow(new BackgroundError('Nope'));
    await expect(
      requestBackground({ type: 'popup/stop' }, () => Promise.resolve(undefined)),
    ).rejects.toThrow('No response');
  });
});
