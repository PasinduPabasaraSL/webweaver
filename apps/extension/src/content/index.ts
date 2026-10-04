import { isContentCommand } from '../messaging/messages';
import { requestBackground } from '../messaging/runtime-client';
import { DomRecorder } from '../recorder/dom-recorder';
import { ContentHost, type ContentRuntime } from './content-host';

interface ContentGlobal {
  __webweaverContentHost?: ContentHost;
}

const runtime: ContentRuntime = {
  request: (message) => requestBackground(message),
  onCommand: (handler) => {
    const listener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): undefined => {
      if (isContentCommand(message)) sendResponse(handler(message));
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  },
};

// A tab can end up with two instances (declared script plus a re-injection after an
// extension reload). The newest instance wins so events are never recorded twice.
const scope = globalThis as ContentGlobal;
scope.__webweaverContentHost?.dispose();

const host = new ContentHost({
  document,
  runtime,
  createRecorder: (sink) =>
    new DomRecorder({
      document,
      sink,
      keyPrefix: crypto.randomUUID().slice(0, 8),
    }),
  log: (message, error) => console.warn(message, error),
});
scope.__webweaverContentHost = host;
void host.init();
