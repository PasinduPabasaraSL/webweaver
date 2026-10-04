import {
  isContentRequest,
  isPopupRequest,
  type ContentRequest,
  type PopupRequest,
  type Response,
} from '../messaging/messages';
import type { RecordingController } from './recording-controller';

/** The subset of `chrome.runtime.MessageSender` the router relies on. */
export interface SenderInfo {
  id?: string;
  url?: string;
  tab?: { id?: number };
  frameId?: number;
}

export interface RouterOptions {
  extensionId: string;
  /** Origin of the extension's own pages, e.g. `chrome-extension://<id>/`. */
  extensionOrigin: string;
}

export type MessageRouter = (message: unknown, sender: SenderInfo) => Promise<Response<unknown>>;

function fail(error: unknown): Response<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function handlePopup(controller: RecordingController, request: PopupRequest) {
  switch (request.type) {
    case 'popup/get-status':
      return controller.getStatus();
    case 'popup/start':
      return controller.start(request.tabId);
    case 'popup/stop':
      return controller.stop();
    case 'popup/get-last-recording':
      return (await controller.getLastRecording()) ?? null;
  }
}

async function handleContent(
  controller: RecordingController,
  request: ContentRequest,
  tabId: number,
  frameId: number,
) {
  switch (request.type) {
    case 'content/get-status':
      return { recording: frameId === 0 && (await controller.isRecordingTab(tabId)) };
    case 'content/capture':
      return { accepted: await controller.handleCapture(tabId, frameId, request.capture) };
    case 'content/page-info':
      return {
        accepted: await controller.handlePageInfo(tabId, frameId, request.url, request.title),
      };
  }
}

/**
 * Routes runtime messages to the controller. Popup requests are only honoured from the
 * extension's own pages and content requests only from web pages, so a content script
 * cannot drive the recorder's lifecycle.
 */
export function createMessageRouter(
  controller: RecordingController,
  options: RouterOptions,
): MessageRouter {
  return async (message, sender) => {
    if (sender.id !== options.extensionId) return fail('Message from an unknown sender.');
    const fromExtensionPage = sender.url?.startsWith(options.extensionOrigin) ?? false;
    try {
      if (isPopupRequest(message)) {
        if (!fromExtensionPage) return fail('Popup requests must come from an extension page.');
        return { ok: true, data: await handlePopup(controller, message) };
      }
      if (isContentRequest(message)) {
        const tabId = sender.tab?.id;
        if (fromExtensionPage || tabId === undefined) {
          return fail('Content requests must come from a web page.');
        }
        return {
          ok: true,
          data: await handleContent(controller, message, tabId, sender.frameId ?? 0),
        };
      }
      return fail('Unsupported or malformed message.');
    } catch (error) {
      return fail(error);
    }
  };
}
