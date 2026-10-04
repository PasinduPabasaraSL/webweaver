import { describe, expect, it, vi } from 'vitest';
import { ContentHost, type ContentRuntime, type Recorder } from '../src/content/content-host';
import type { ContentCommand, ContentRequest, Response } from '../src/messaging/messages';
import type { CaptureSink } from '../src/recorder/capture';
import { clickCapture } from './fakes';

class FakeRecorder implements Recorder {
  isActive = false;
  constructor(readonly sink: CaptureSink) {}
  start(): void {
    this.isActive = true;
  }
  stop(): void {
    this.isActive = false;
  }
}

function setup(respond: (message: ContentRequest) => unknown = () => ({ recording: false })) {
  const requests: ContentRequest[] = [];
  let commandHandler: ((command: ContentCommand) => Response<unknown>) | undefined;
  const unsubscribe = vi.fn();
  const runtime: ContentRuntime = {
    request: (message) => {
      requests.push(message);
      try {
        return Promise.resolve(respond(message));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    onCommand: (handler) => {
      commandHandler = handler;
      return unsubscribe;
    },
  };
  let recorder: FakeRecorder | undefined;
  const host = new ContentHost({
    document,
    runtime,
    createRecorder: (sink) => (recorder = new FakeRecorder(sink)),
  });
  return {
    host,
    requests,
    unsubscribe,
    recorder: () => recorder!,
    command: (command: ContentCommand) => commandHandler!(command),
  };
}

describe('ContentHost', () => {
  it('stays idle when the tab is not being recorded', async () => {
    const { host, requests } = setup();
    await host.init();
    expect(requests).toEqual([{ type: 'content/get-status' }]);
    expect(host.isRecording).toBe(false);
  });

  it('resumes recording on a new page of a recorded tab and reports the page title', async () => {
    document.title = 'Dashboard';
    const { host, requests } = setup((m) =>
      m.type === 'content/get-status' ? { recording: true } : { accepted: true },
    );
    await host.init();
    expect(host.isRecording).toBe(true);
    expect(requests[1]).toEqual({
      type: 'content/page-info',
      url: document.location.href,
      title: 'Dashboard',
    });
  });

  it('starts and stops on background commands', async () => {
    const { host, command } = setup();
    await host.init();
    expect(command({ type: 'recorder/start' })).toEqual({ ok: true, data: { recording: true } });
    expect(host.isRecording).toBe(true);
    expect(command({ type: 'recorder/ping' })).toEqual({ ok: true, data: { recording: true } });
    expect(command({ type: 'recorder/stop' })).toEqual({ ok: true, data: { recording: false } });
    expect(host.isRecording).toBe(false);
  });

  it('forwards captures to the background', async () => {
    const { host, requests, recorder } = setup();
    await host.init();
    const capture = clickCapture('2026-09-29T05:00:01Z');
    recorder().sink(capture);
    expect(requests.at(-1)).toEqual({ type: 'content/capture', capture });
  });

  it('shuts down when the extension context is invalidated', async () => {
    const { host, recorder, unsubscribe } = setup((m) => {
      if (m.type === 'content/capture') throw new Error('Extension context invalidated.');
      return { recording: true };
    });
    await host.init();
    recorder().sink(clickCapture('2026-09-29T05:00:01Z'));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.isRecording).toBe(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('refuses commands after being disposed', async () => {
    const { host, command } = setup();
    await host.init();
    host.dispose();
    expect(command({ type: 'recorder/start' })).toEqual({ ok: false, error: 'Recorder disposed.' });
    expect(host.isRecording).toBe(false);
  });
});
