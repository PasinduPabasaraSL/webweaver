import type { RecordingDocument } from '@webweaver/workflow-schema';
import type { Capture } from '../recorder/capture';

/** Messages sent by the popup (an extension page) to the background service worker. */
export type PopupRequest =
  | { type: 'popup/get-status' }
  | { type: 'popup/start'; tabId: number }
  | { type: 'popup/stop' }
  | { type: 'popup/get-last-recording' };

/** Messages sent by the content script to the background service worker. */
export type ContentRequest =
  | { type: 'content/get-status' }
  | { type: 'content/capture'; capture: Capture }
  | { type: 'content/page-info'; url: string; title: string };

export type BackgroundRequest = PopupRequest | ContentRequest;

/** Messages sent by the background service worker to a content script. */
export type ContentCommand =
  | { type: 'recorder/start' }
  | { type: 'recorder/stop' }
  | { type: 'recorder/ping' };

export interface RecentAction {
  id: string;
  description: string;
}

export interface LastRecordingSummary {
  name: string;
  actionCount: number;
  createdAt: string;
  fileName: string;
}

export interface RecorderStatus {
  state: 'idle' | 'recording';
  tabId?: number;
  startUrl?: string;
  startedAt?: string;
  actionCount: number;
  recentActions: RecentAction[];
  lastRecording?: LastRecordingSummary;
}

export interface ResponseMap {
  'popup/get-status': RecorderStatus;
  'popup/start': RecorderStatus;
  'popup/stop': RecordingDocument;
  'popup/get-last-recording': RecordingDocument | null;
  'content/get-status': { recording: boolean };
  'content/capture': { accepted: boolean };
  'content/page-info': { accepted: boolean };
}

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

const POPUP_TYPES = new Set<string>([
  'popup/get-status',
  'popup/start',
  'popup/stop',
  'popup/get-last-recording',
]);
const CONTENT_TYPES = new Set<string>([
  'content/get-status',
  'content/capture',
  'content/page-info',
]);
const COMMAND_TYPES = new Set<string>(['recorder/start', 'recorder/stop', 'recorder/ping']);

function hasType(message: unknown): message is { type: string } {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string'
  );
}

function isCapture(value: unknown): value is Capture {
  if (typeof value !== 'object' || value === null) return false;
  const draft = (value as { draft?: unknown }).draft;
  if (typeof draft !== 'object' || draft === null) return false;
  const { type, url, title, timestamp } = draft as Record<string, unknown>;
  return (
    (type === 'click' || type === 'input') &&
    typeof url === 'string' &&
    typeof title === 'string' &&
    typeof timestamp === 'string'
  );
}

export function isPopupRequest(message: unknown): message is PopupRequest {
  if (!hasType(message) || !POPUP_TYPES.has(message.type)) return false;
  if (message.type === 'popup/start') {
    return Number.isInteger((message as { tabId?: unknown }).tabId);
  }
  return true;
}

export function isContentRequest(message: unknown): message is ContentRequest {
  if (!hasType(message) || !CONTENT_TYPES.has(message.type)) return false;
  const m = message as Record<string, unknown>;
  if (message.type === 'content/capture') return isCapture(m['capture']);
  if (message.type === 'content/page-info') {
    return typeof m['url'] === 'string' && typeof m['title'] === 'string';
  }
  return true;
}

export function isContentCommand(message: unknown): message is ContentCommand {
  return hasType(message) && COMMAND_TYPES.has(message.type);
}
