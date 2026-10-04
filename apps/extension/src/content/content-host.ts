import type { ContentCommand, ContentRequest, Response } from '../messaging/messages';
import type { CaptureSink } from '../recorder/capture';

export interface Recorder {
  readonly isActive: boolean;
  start(): void;
  stop(): void;
}

export interface ContentRuntime {
  /** Sends a request to the background; resolves with its unwrapped data. */
  request(message: ContentRequest): Promise<unknown>;
  /** Registers a handler for background commands and returns an unsubscribe function. */
  onCommand(handler: (command: ContentCommand) => Response<unknown>): () => void;
}

export interface ContentHostOptions {
  document: Document;
  runtime: ContentRuntime;
  createRecorder: (sink: CaptureSink) => Recorder;
  log?: (message: string, error?: unknown) => void;
}

/** After an extension reload, APIs of the old content script throw this. */
function isContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /context invalidated/i.test(error.message);
}

/**
 * Lifecycle of the recorder inside one page: asks the background whether this tab is being
 * recorded, reacts to start/stop commands, forwards captures, and shuts itself down when the
 * extension is reloaded underneath it.
 */
export class ContentHost {
  private readonly document: Document;
  private readonly runtime: ContentRuntime;
  private readonly recorder: Recorder;
  private readonly log: (message: string, error?: unknown) => void;
  private unsubscribe: (() => void) | undefined;
  private disposed = false;

  constructor(options: ContentHostOptions) {
    this.document = options.document;
    this.runtime = options.runtime;
    this.log = options.log ?? (() => undefined);
    this.recorder = options.createRecorder((capture) => {
      this.send({ type: 'content/capture', capture });
    });
  }

  get isRecording(): boolean {
    return this.recorder.isActive;
  }

  async init(): Promise<void> {
    this.unsubscribe = this.runtime.onCommand((command) => this.handleCommand(command));
    try {
      const status = (await this.runtime.request({ type: 'content/get-status' })) as {
        recording: boolean;
      };
      if (status.recording && !this.disposed) this.startRecording();
    } catch (error) {
      this.handleError('status request failed', error);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.recorder.stop();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  handleCommand(command: ContentCommand): Response<unknown> {
    if (this.disposed) return { ok: false, error: 'Recorder disposed.' };
    switch (command.type) {
      case 'recorder/start':
        this.startRecording();
        return { ok: true, data: { recording: true } };
      case 'recorder/stop':
        this.recorder.stop();
        return { ok: true, data: { recording: false } };
      case 'recorder/ping':
        return { ok: true, data: { recording: this.recorder.isActive } };
    }
  }

  private startRecording(): void {
    this.recorder.start();
    this.whenDomReady(() => {
      this.send({
        type: 'content/page-info',
        url: this.document.location.href,
        title: this.document.title,
      });
    });
  }

  private whenDomReady(callback: () => void): void {
    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  private send(message: ContentRequest): void {
    if (this.disposed) return;
    try {
      this.runtime
        .request(message)
        .catch((error: unknown) => this.handleError('send failed', error));
    } catch (error) {
      this.handleError('send failed', error);
    }
  }

  private handleError(context: string, error: unknown): void {
    if (isContextInvalidated(error)) {
      this.dispose();
      return;
    }
    this.log(`[WebWeaver] ${context}`, error);
  }
}
