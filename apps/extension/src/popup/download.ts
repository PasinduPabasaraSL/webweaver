import { recordingFileName, serializeRecording } from '@webweaver/core';
import type { RecordingDocument } from '@webweaver/workflow-schema';

const REVOKE_DELAY_MS = 60_000;

/**
 * Saves the recording through `chrome.downloads`. A Blob URL is used instead of a data URL
 * because data URLs become unreliable for large recordings.
 */
export async function downloadRecording(recording: RecordingDocument): Promise<void> {
  const blob = new Blob([serializeRecording(recording)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: recordingFileName(recording),
      saveAs: false,
      conflictAction: 'uniquify',
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}
