import { ChromeBrowserGateway } from './chrome-browser';
import { createMessageRouter } from './message-router';
import type { NavigationEvent, NavigationKind } from './navigation';
import { RecordingController } from './recording-controller';
import { ChromeSessionStateStore } from './state-store';

const controller = new RecordingController({
  store: new ChromeSessionStateStore(),
  browser: new ChromeBrowserGateway(),
  recorder: {
    name: 'webweaver-extension',
    version: chrome.runtime.getManifest().version,
    userAgent: navigator.userAgent,
  },
});

const route = createMessageRouter(controller, {
  extensionId: chrome.runtime.id,
  extensionOrigin: chrome.runtime.getURL(''),
});

// MV3 requires listeners to be registered synchronously at the top level so events can
// wake a stopped service worker.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void route(message, sender).then(sendResponse);
  return true;
});

function logFailure(error: unknown): void {
  console.error('[WebWeaver] background task failed', error);
}

type WebNavigationDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails;

function forwardNavigation(kind: NavigationKind) {
  return (details: WebNavigationDetails): void => {
    const event: NavigationEvent = {
      kind,
      tabId: details.tabId,
      frameId: details.frameId,
      url: details.url,
      timeStamp: details.timeStamp,
      transitionType: details.transitionType,
      transitionQualifiers: details.transitionQualifiers,
    };
    controller.handleNavigation(event).catch(logFailure);
  };
}

chrome.webNavigation.onCommitted.addListener(forwardNavigation('committed'));
chrome.webNavigation.onHistoryStateUpdated.addListener(forwardNavigation('history'));
chrome.webNavigation.onReferenceFragmentUpdated.addListener(forwardNavigation('fragment'));

chrome.tabs.onRemoved.addListener((tabId) => {
  controller.handleTabRemoved(tabId).catch(logFailure);
});
