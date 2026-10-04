import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

/**
 * Minimal Chrome DevTools Protocol client over `--remote-debugging-pipe` (NUL-delimited
 * JSON on fds 3 and 4). The pipe transport is required for `Extensions.loadUnpacked`,
 * which is how branded Chrome (which ignores `--load-extension`) loads unpacked extensions.
 */
export class CdpClient {
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(message: CdpMessage) => void>();

  constructor(
    private readonly output: Writable,
    input: Readable,
  ) {
    input.setEncoding('utf8');
    input.on('data', (chunk: string) => this.onData(chunk));
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    const id = this.nextId++;
    const message: CdpMessage = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, method });
      this.output.write(`${JSON.stringify(message)}\0`);
    });
  }

  waitForEvent(
    method: string,
    predicate: (params: Record<string, unknown>) => boolean = () => true,
    timeoutMs = 15_000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const listener = (message: CdpMessage) => {
        if (message.method === method && predicate(message.params ?? {})) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(message.params ?? {});
        }
      };
      this.listeners.add(listener);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let end: number;
    while ((end = this.buffer.indexOf('\0')) !== -1) {
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      this.dispatch(JSON.parse(raw) as CdpMessage);
    }
  }

  private dispatch(message: CdpMessage): void {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }
}

const CHROME_CANDIDATES = [
  process.env['CHROME_PATH'],
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

export function findChrome(): string | undefined {
  return CHROME_CANDIDATES.find((path): path is string => !!path && existsSync(path));
}

export interface LaunchedChrome {
  process: ChildProcess;
  cdp: CdpClient;
  close(): Promise<void>;
}

export function launchChrome(executable: string, userDataDir: string): LaunchedChrome {
  const args = [
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--window-size=1280,900',
  ];
  if (process.env['E2E_HEADED'] !== '1') args.push('--headless');
  if (process.env['E2E_NO_SANDBOX'] === '1') args.push('--no-sandbox');

  const child = spawn(executable, [...args, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  });
  const cdp = new CdpClient(child.stdio[3] as Writable, child.stdio[4] as Readable);
  return {
    process: child,
    cdp,
    close: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        cdp.send('Browser.close').catch(() => child.kill('SIGKILL'));
      }),
  };
}
