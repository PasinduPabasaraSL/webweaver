import type { RecorderStatus } from '../messaging/messages';

export interface PopupViewModel {
  statusLabel: string;
  isRecording: boolean;
  detail: string;
  canStart: boolean;
  canStop: boolean;
  canDownload: boolean;
  downloadLabel: string;
  recentActions: string[];
}

function formatElapsed(startedAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Pure mapping from recorder status to what the popup shows; keeps the DOM code trivial. */
export function toViewModel(status: RecorderStatus, now: Date, busy = false): PopupViewModel {
  const recording = status.state === 'recording';
  const actions = `${status.actionCount} action${status.actionCount === 1 ? '' : 's'}`;
  const last = status.lastRecording;

  let detail: string;
  if (recording) {
    const elapsed = status.startedAt ? ` · ${formatElapsed(status.startedAt, now)}` : '';
    detail = `${status.startUrl ?? ''}\n${actions}${elapsed}`;
  } else if (last) {
    detail = `Last: ${last.name} (${last.actionCount} actions)`;
  } else {
    detail = 'Open a website, then start recording.';
  }

  return {
    statusLabel: recording ? 'Recording' : 'Idle',
    isRecording: recording,
    detail,
    canStart: !recording && !busy,
    canStop: recording && !busy,
    canDownload: !recording && !busy && last !== undefined,
    downloadLabel: last ? `Download ${last.fileName}` : 'Download last recording',
    recentActions: recording ? status.recentActions.map((a) => a.description) : [],
  };
}
