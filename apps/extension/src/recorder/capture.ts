import type { ActionDraft } from '@webweaver/core';

/** A draft plus the recorder-side metadata the background needs to merge it correctly. */
export interface Capture {
  draft: ActionDraft;
  coalesceKey?: string;
}

export type CaptureSink = (capture: Capture) => void;
