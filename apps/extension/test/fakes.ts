import type { ContentCommand } from '../src/messaging/messages';
import type { Capture } from '../src/recorder/capture';
import type { BrowserGateway, TabInfo } from '../src/background/recording-controller';

export class FakeBrowser implements BrowserGateway {
  readonly tabs = new Map<number, TabInfo>();
  readonly sent: { tabId: number; command: ContentCommand }[] = [];
  readonly injected: number[] = [];
  readonly indicator = new Map<number, boolean>();
  /** Tabs with a live content script; others reject messages like Chrome does. */
  readonly listening = new Set<number>();
  injectionError: Error | undefined;

  addTab(tab: TabInfo, listening = true): void {
    this.tabs.set(tab.id, tab);
    if (listening) this.listening.add(tab.id);
  }

  getTab(tabId: number): Promise<TabInfo | undefined> {
    return Promise.resolve(this.tabs.get(tabId));
  }

  sendToTab(tabId: number, command: ContentCommand): Promise<unknown> {
    this.sent.push({ tabId, command });
    if (!this.listening.has(tabId)) {
      return Promise.reject(
        new Error('Could not establish connection. Receiving end does not exist.'),
      );
    }
    return Promise.resolve({ ok: true, data: {} });
  }

  injectContentScript(tabId: number): Promise<void> {
    if (this.injectionError) return Promise.reject(this.injectionError);
    this.injected.push(tabId);
    this.listening.add(tabId);
    return Promise.resolve();
  }

  setRecordingIndicator(tabId: number, recording: boolean): Promise<void> {
    this.indicator.set(tabId, recording);
    return Promise.resolve();
  }
}

export function clickCapture(timestamp: string, url = 'https://example.com/login'): Capture {
  return {
    draft: {
      type: 'click',
      url,
      title: 'Login',
      timestamp,
      target: {
        element: {
          tagName: 'button',
          id: 'login',
          text: 'Log in',
          classes: [],
          ariaAttributes: {},
          dataAttributes: {},
          attributes: {},
        },
      },
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
    },
  };
}

export function inputCapture(value: string, timestamp: string, coalesceKey = 'k:1'): Capture {
  return {
    draft: {
      type: 'input',
      url: 'https://example.com/login',
      title: 'Login',
      timestamp,
      target: {
        element: {
          tagName: 'input',
          id: 'username',
          classes: [],
          ariaAttributes: {},
          dataAttributes: {},
          attributes: {},
        },
      },
      value,
    },
    coalesceKey,
  };
}
