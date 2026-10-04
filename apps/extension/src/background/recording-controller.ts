import {
  appendDraft,
  applyPageTitle,
  createSession,
  describeAction,
  finalizeSession,
  recordingFileName,
} from '@webweaver/core';
import type { RecorderInfo, RecordingDocument } from '@webweaver/workflow-schema';
import type { ContentCommand, RecorderStatus } from '../messaging/messages';
import type { Capture } from '../recorder/capture';
import { navigationTrigger, type NavigationEvent } from './navigation';
import { SerialQueue } from './serial-queue';
import type { RecorderState, StateStore } from './state-store';

export interface TabInfo {
  id: number;
  url?: string;
  title?: string;
}

/** Browser capabilities the controller needs; implemented with `chrome.*` in production. */
export interface BrowserGateway {
  getTab(tabId: number): Promise<TabInfo | undefined>;
  /** Resolves with the content script's reply; rejects if no content script is listening. */
  sendToTab(tabId: number, command: ContentCommand): Promise<unknown>;
  injectContentScript(tabId: number): Promise<void>;
  setRecordingIndicator(tabId: number, recording: boolean): Promise<void>;
}

export interface RecordingControllerDeps {
  store: StateStore;
  browser: BrowserGateway;
  recorder: RecorderInfo;
  now?: () => Date;
  newId?: () => string;
}

export class RecorderError extends Error {
  override readonly name = 'RecorderError';
}

const RECENT_ACTION_COUNT = 5;

export function isRecordableUrl(url: string | undefined): url is string {
  return url !== undefined && /^https?:\/\//i.test(url);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the recording lifecycle. State is re-read from the store for every operation, so a
 * service-worker restart mid-recording is transparent.
 */
export class RecordingController {
  private readonly queue = new SerialQueue();
  private readonly store: StateStore;
  private readonly browser: BrowserGateway;
  private readonly recorder: RecorderInfo;
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(deps: RecordingControllerDeps) {
    this.store = deps.store;
    this.browser = deps.browser;
    this.recorder = deps.recorder;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  getStatus(): Promise<RecorderStatus> {
    return this.queue.run(async () => toStatus(await this.store.load()));
  }

  getLastRecording(): Promise<RecordingDocument | undefined> {
    return this.queue.run(async () => (await this.store.load()).lastRecording);
  }

  isRecordingTab(tabId: number): Promise<boolean> {
    return this.queue.run(async () => (await this.store.load()).active?.tabId === tabId);
  }

  start(tabId: number): Promise<RecorderStatus> {
    return this.queue.run(async () => {
      const state = await this.store.load();
      if (state.active) {
        if (state.active.tabId === tabId) return toStatus(state);
        throw new RecorderError('Already recording another tab. Stop that recording first.');
      }

      const tab = await this.browser.getTab(tabId);
      if (!tab) throw new RecorderError('The tab to record no longer exists.');
      if (!isRecordableUrl(tab.url)) {
        throw new RecorderError('Only http:// and https:// pages can be recorded.');
      }

      const session = createSession({
        id: this.newId(),
        startedAt: this.now(),
        startUrl: tab.url,
        startTitle: tab.title ?? '',
      });
      const next: RecorderState = { ...state, active: { tabId, session } };
      await this.store.save(next);

      try {
        await this.attachRecorder(tabId);
      } catch (error) {
        await this.store.save(state);
        throw new RecorderError(
          `Could not attach the recorder to this page: ${describeError(error)}`,
        );
      }
      await this.browser.setRecordingIndicator(tabId, true);
      return toStatus(next);
    });
  }

  stop(): Promise<RecordingDocument> {
    return this.queue.run(async () => {
      const recording = await this.finishActive();
      if (!recording) throw new RecorderError('No recording is in progress.');
      return recording;
    });
  }

  handleCapture(tabId: number, frameId: number, capture: Capture): Promise<boolean> {
    return this.queue.run(async () => {
      const state = await this.store.load();
      if (!state.active || state.active.tabId !== tabId || frameId !== 0) return false;
      const { session, outcome } = appendDraft(state.active.session, capture.draft, {
        ...(capture.coalesceKey !== undefined ? { coalesceKey: capture.coalesceKey } : {}),
      });
      if (outcome !== 'skipped') {
        await this.store.save({ ...state, active: { tabId, session } });
      }
      return true;
    });
  }

  handleNavigation(event: NavigationEvent): Promise<void> {
    return this.queue.run(async () => {
      const state = await this.store.load();
      if (!state.active || state.active.tabId !== event.tabId || event.frameId !== 0) return;
      const { session, outcome } = appendDraft(state.active.session, {
        type: 'navigate',
        trigger: navigationTrigger(event),
        url: event.url,
        title: '',
        timestamp: new Date(event.timeStamp).toISOString(),
      });
      if (outcome !== 'skipped') {
        await this.store.save({ ...state, active: { tabId: event.tabId, session } });
      }
    });
  }

  handlePageInfo(tabId: number, frameId: number, url: string, title: string): Promise<boolean> {
    return this.queue.run(async () => {
      const state = await this.store.load();
      if (!state.active || state.active.tabId !== tabId || frameId !== 0) return false;
      const session = applyPageTitle(state.active.session, url, title);
      if (session !== state.active.session) {
        await this.store.save({ ...state, active: { tabId, session } });
      }
      return true;
    });
  }

  /** Closing the recorded tab ends the recording; it stays available as the last recording. */
  handleTabRemoved(tabId: number): Promise<void> {
    return this.queue.run(async () => {
      const state = await this.store.load();
      if (state.active?.tabId === tabId) await this.finishActive();
    });
  }

  private async finishActive(): Promise<RecordingDocument | undefined> {
    const state = await this.store.load();
    if (!state.active) return undefined;
    const { tabId, session } = state.active;
    const recording = finalizeSession(session, { endedAt: this.now(), recorder: this.recorder });
    await this.store.save({ lastRecording: recording });

    // The tab may be gone or showing a page without the content script; that is fine.
    await this.browser.sendToTab(tabId, { type: 'recorder/stop' }).catch(() => undefined);
    await this.browser.setRecordingIndicator(tabId, false).catch(() => undefined);
    return recording;
  }

  /**
   * Content scripts are declared in the manifest, but tabs opened before the extension was
   * installed or reloaded have no live content script. Those get one injected; on start-up
   * it asks for the recording status and begins recording by itself.
   */
  private async attachRecorder(tabId: number): Promise<void> {
    try {
      await this.browser.sendToTab(tabId, { type: 'recorder/start' });
    } catch {
      await this.browser.injectContentScript(tabId);
    }
  }
}

function toStatus(state: RecorderState): RecorderStatus {
  const status: RecorderStatus = {
    state: state.active ? 'recording' : 'idle',
    actionCount: state.active?.session.actions.length ?? 0,
    recentActions: (state.active?.session.actions ?? [])
      .slice(-RECENT_ACTION_COUNT)
      .map((action) => ({ id: action.id, description: describeAction(action) })),
  };
  if (state.active) {
    status.tabId = state.active.tabId;
    status.startUrl = state.active.session.startUrl;
    status.startedAt = state.active.session.startedAt;
  }
  if (state.lastRecording) {
    status.lastRecording = {
      name: state.lastRecording.workflow.name,
      actionCount: state.lastRecording.actions.length,
      createdAt: state.lastRecording.workflow.createdAt,
      fileName: recordingFileName(state.lastRecording),
    };
  }
  return status;
}
