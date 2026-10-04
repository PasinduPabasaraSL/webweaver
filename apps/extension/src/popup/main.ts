import type { RecorderStatus } from '../messaging/messages';
import { requestBackground } from '../messaging/runtime-client';
import { downloadRecording } from './download';
import { queryPopupElements, render, showError, type PopupElements } from './view';
import { toViewModel } from './view-model';

const REFRESH_INTERVAL_MS = 1000;

const elements: PopupElements = queryPopupElements(document);
let status: RecorderStatus | undefined;
let busy = false;

function update(): void {
  if (status) render(elements, toViewModel(status, new Date(), busy));
}

async function refresh(): Promise<void> {
  status = await requestBackground({ type: 'popup/get-status' });
  update();
}

async function runAction(action: () => Promise<void>): Promise<void> {
  busy = true;
  showError(elements, undefined);
  update();
  try {
    await action();
  } catch (error) {
    showError(elements, error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
    await refresh().catch(() => undefined);
  }
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab to record.');
  return tab.id;
}

elements.startButton.addEventListener('click', () => {
  void runAction(async () => {
    status = await requestBackground({ type: 'popup/start', tabId: await activeTabId() });
  });
});

elements.stopButton.addEventListener('click', () => {
  void runAction(async () => {
    const recording = await requestBackground({ type: 'popup/stop' });
    await downloadRecording(recording);
  });
});

elements.downloadButton.addEventListener('click', () => {
  void runAction(async () => {
    const recording = await requestBackground({ type: 'popup/get-last-recording' });
    if (!recording) throw new Error('There is no finished recording yet.');
    await downloadRecording(recording);
  });
});

refresh().catch((error: unknown) => {
  showError(elements, error instanceof Error ? error.message : String(error));
});
setInterval(() => {
  if (!busy) refresh().catch(() => undefined);
}, REFRESH_INTERVAL_MS);
