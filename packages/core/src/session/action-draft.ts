import type { RecordedAction } from '@webweaver/workflow-schema';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An action as captured by a recorder, before the session assigns it an id. */
export type ActionDraft = DistributiveOmit<RecordedAction, 'id'>;

export function formatActionId(sequence: number): string {
  return `action-${String(sequence).padStart(3, '0')}`;
}
