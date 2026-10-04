import type { ContentCommand } from '../messaging/messages';
import type { BrowserGateway, TabInfo } from './recording-controller';

export const CONTENT_SCRIPT_FILE = 'content.js';

const BADGE_COLOR = '#d93025';

export class ChromeBrowserGateway implements BrowserGateway {
  async getTab(tabId: number): Promise<TabInfo | undefined> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return {
        id: tabId,
        ...(tab.url !== undefined ? { url: tab.url } : {}),
        ...(tab.title !== undefined ? { title: tab.title } : {}),
      };
    } catch {
      return undefined;
    }
  }

  sendToTab(tabId: number, command: ContentCommand): Promise<unknown> {
    return chrome.tabs.sendMessage(tabId, command, { frameId: 0 });
  }

  async injectContentScript(tabId: number): Promise<void> {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: [CONTENT_SCRIPT_FILE],
    });
  }

  async setRecordingIndicator(_tabId: number, recording: boolean): Promise<void> {
    await chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
    if (recording) await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  }
}
