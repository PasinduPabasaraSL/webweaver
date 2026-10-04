import type { RecordingSession } from '@webweaver/core';
import type { RecordingDocument } from '@webweaver/workflow-schema';

export interface ActiveRecording {
  tabId: number;
  session: RecordingSession;
}

export interface RecorderState {
  active?: ActiveRecording;
  lastRecording?: RecordingDocument;
}

export interface StateStore {
  load(): Promise<RecorderState>;
  save(state: RecorderState): Promise<void>;
}

const STATE_KEY = 'webweaver.recorder.state';

/**
 * Persists state in `chrome.storage.session`: it survives service-worker restarts (MV3
 * workers are stopped after ~30s idle), is held in memory only, is cleared when the browser
 * exits, and is not readable by content scripts.
 */
export class ChromeSessionStateStore implements StateStore {
  async load(): Promise<RecorderState> {
    const items = await chrome.storage.session.get(STATE_KEY);
    return (items[STATE_KEY] as RecorderState | undefined) ?? {};
  }

  async save(state: RecorderState): Promise<void> {
    await chrome.storage.session.set({ [STATE_KEY]: state });
  }
}

export class MemoryStateStore implements StateStore {
  private state: RecorderState = {};

  load(): Promise<RecorderState> {
    return Promise.resolve(structuredClone(this.state));
  }

  save(state: RecorderState): Promise<void> {
    this.state = structuredClone(state);
    return Promise.resolve();
  }
}
