import type { RecordedAction } from './actions';
import type { RecordingSchemaVersion } from './version';

export interface WorkflowInfo {
  id: string;
  name: string;
  /** ISO-8601 time the recording started. */
  createdAt: string;
  /** ISO-8601 time the recording stopped. */
  endedAt: string;
  startUrl: string;
}

export interface RecorderInfo {
  name: string;
  version: string;
  userAgent?: string;
}

/** The on-disk `recording.json` document. */
export interface RecordingDocument {
  version: RecordingSchemaVersion;
  workflow: WorkflowInfo;
  recorder: RecorderInfo;
  actions: RecordedAction[];
}
