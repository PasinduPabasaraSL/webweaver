import { formatVariable, redactUrl } from '@webweaver/core';
import type { Redaction } from '@webweaver/workflow-schema';
import { createElementSnapshot, type SnapshotLimits } from '../dom/element-snapshot';
import {
  eventOriginElement,
  readEditableValue,
  resolveEditableTarget,
  resolveInteractiveTarget,
} from '../dom/interactive-target';
import { classifyElement } from '../dom/sensitivity';
import type { CaptureSink } from './capture';
import { ElementKeys } from './element-keys';

/** Upper bound on recorded input length; longer values are almost certainly pasted blobs. */
const MAX_INPUT_VALUE_LENGTH = 10_000;

/** Clicking a <label> makes the browser dispatch a second click on its control. */
const LABEL_FORWARD_WINDOW_MS = 100;

export interface DomRecorderOptions {
  document: Document;
  sink: CaptureSink;
  now?: () => Date;
  /** Only user-initiated events are recorded by default; tests inject a permissive filter. */
  acceptEvent?: (event: Event) => boolean;
  keyPrefix?: string;
  snapshotLimits?: SnapshotLimits;
}

interface ForwardedLabelClick {
  control: Element;
  at: number;
}

export class DomRecorder {
  private readonly document: Document;
  private readonly sink: CaptureSink;
  private readonly now: () => Date;
  private readonly acceptEvent: (event: Event) => boolean;
  private readonly keys: ElementKeys;
  private readonly snapshotLimits: SnapshotLimits | undefined;
  private lastLabelClick: ForwardedLabelClick | undefined;
  private active = false;

  constructor(options: DomRecorderOptions) {
    this.document = options.document;
    this.sink = options.sink;
    this.now = options.now ?? (() => new Date());
    this.acceptEvent = options.acceptEvent ?? ((event) => event.isTrusted);
    this.keys = new ElementKeys(options.keyPrefix ?? 'el');
    this.snapshotLimits = options.snapshotLimits;
  }

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    // Capture phase on the window runs before page handlers can stop propagation.
    const target = this.eventTarget();
    target.addEventListener('click', this.onClick, true);
    target.addEventListener('input', this.onInput, true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    const target = this.eventTarget();
    target.removeEventListener('click', this.onClick, true);
    target.removeEventListener('input', this.onInput, true);
    this.lastLabelClick = undefined;
  }

  private eventTarget(): EventTarget {
    return this.document.defaultView ?? this.document;
  }

  private pageContext(timestamp: Date) {
    return {
      url: redactUrl(this.document.location?.href ?? ''),
      title: this.document.title,
      timestamp: timestamp.toISOString(),
    };
  }

  private snapshot(element: Element) {
    return createElementSnapshot(element, this.snapshotLimits);
  }

  private isForwardedLabelClick(target: Element, at: number): boolean {
    const last = this.lastLabelClick;
    return last !== undefined && last.control === target && at - last.at <= LABEL_FORWARD_WINDOW_MS;
  }

  private readonly onClick = (event: Event): void => {
    if (!(event instanceof MouseEvent) || !this.acceptEvent(event)) return;
    const origin = eventOriginElement(event);
    if (!origin) return;

    const target = resolveInteractiveTarget(origin);
    const now = this.now();
    if (this.isForwardedLabelClick(target, now.getTime())) {
      this.lastLabelClick = undefined;
      return;
    }
    this.lastLabelClick =
      target instanceof HTMLLabelElement && target.control
        ? { control: target.control, at: now.getTime() }
        : undefined;

    this.sink({
      draft: {
        type: 'click',
        ...this.pageContext(now),
        target: { element: this.snapshot(target) },
        modifiers: {
          alt: event.altKey,
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey,
        },
      },
    });
  };

  private readonly onInput = (event: Event): void => {
    if (!this.acceptEvent(event)) return;
    const origin = eventOriginElement(event);
    if (!origin) return;
    const target = resolveEditableTarget(origin);
    if (!target) return;

    const match = classifyElement(target);
    const redaction: Redaction | undefined = match
      ? { variable: match.variable, reason: match.reason }
      : undefined;
    const value = redaction
      ? formatVariable(redaction.variable)
      : readEditableValue(target).slice(0, MAX_INPUT_VALUE_LENGTH);

    this.sink({
      draft: {
        type: 'input',
        ...this.pageContext(this.now()),
        target: { element: this.snapshot(target) },
        value,
        ...(redaction ? { redaction } : {}),
      },
      coalesceKey: this.keys.keyFor(target),
    });
  };
}
