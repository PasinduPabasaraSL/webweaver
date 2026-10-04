import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeAction } from '@webweaver/core';
import { validateRecording, type RecordingDocument } from '@webweaver/workflow-schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findChrome, launchChrome, type LaunchedChrome } from './support/cdp';
import { delay, PageSession } from './support/page';
import { startTestSite } from './support/test-site';

const EXTENSION_DIST = resolve(import.meta.dirname, '../../apps/extension/dist');
const OUTPUT_DIR = resolve(import.meta.dirname, '.output');
const chromePath = findChrome();

/** Content scripts start asynchronously after a page load; give them a moment to attach. */
const CONTENT_SCRIPT_SETTLE_MS = 400;

interface Response<T> {
  ok: boolean;
  data: T;
  error?: string;
}

async function waitForFile(dir: string, pattern: RegExp, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = readdirSync(dir).find((name) => pattern.test(name));
    if (match) return join(dir, match);
    await delay(100);
  }
  throw new Error(`No file matching ${pattern} appeared in ${dir}`);
}

function summarize(recording: RecordingDocument) {
  return recording.actions.map((action) => {
    const path = new URL(action.url).pathname;
    switch (action.type) {
      case 'navigate':
        return `navigate ${path} (${action.trigger})`;
      case 'click':
        return `click #${action.target.element.id ?? '?'}`;
      case 'input':
        return `input #${action.target.element.id ?? '?'} = ${action.value}`;
    }
  });
}

describe.skipIf(!chromePath)('WebWeaver extension in Chrome', () => {
  let browser: LaunchedChrome;
  let site: Awaited<ReturnType<typeof startTestSite>>;
  let extensionId: string;
  let workDir: string;
  let downloadDir: string;
  let app: PageSession;

  async function openExtensionPage(): Promise<PageSession> {
    const page = await PageSession.open(
      browser.cdp,
      `chrome-extension://${extensionId}/popup.html`,
    );
    await page
      .waitFor(`document.getElementById('status')?.textContent`)
      .catch(async (error: Error) => {
        const shown = await page.evaluate<string>(`location.href + ' :: ' + document.title`);
        throw new Error(`${error.message}; extension page shows ${shown}`);
      });
    return page;
  }

  async function appTabId(ext: PageSession): Promise<number> {
    return ext.evaluate<number>(
      `chrome.tabs.query({}).then((tabs) => tabs.find((t) => t.url?.startsWith(${JSON.stringify(site.baseUrl)}))?.id)`,
    );
  }

  function message<T>(ext: PageSession, payload: object): Promise<Response<T>> {
    return ext.evaluate<Response<T>>(`chrome.runtime.sendMessage(${JSON.stringify(payload)})`);
  }

  beforeAll(async () => {
    if (!existsSync(join(EXTENSION_DIST, 'manifest.json'))) {
      throw new Error('Extension is not built. Run `pnpm build` (or `pnpm test:e2e`).');
    }
    site = await startTestSite();
    workDir = mkdtempSync(join(tmpdir(), 'webweaver-e2e-'));
    downloadDir = join(workDir, 'downloads');
    mkdirSync(downloadDir);
    // Set the download folder via profile preferences rather than the DevTools download
    // override, which ignores the file name chosen by chrome.downloads.download().
    const profileDir = join(workDir, 'profile');
    mkdirSync(join(profileDir, 'Default'), { recursive: true });
    writeFileSync(
      join(profileDir, 'Default', 'Preferences'),
      JSON.stringify({ download: { default_directory: downloadDir, prompt_for_download: false } }),
    );
    browser = launchChrome(chromePath!, profileDir);

    const loaded = await browser.cdp.send<{ id: string }>('Extensions.loadUnpacked', {
      path: EXTENSION_DIST,
    });
    extensionId = loaded.id;
  });

  afterAll(async () => {
    await browser?.close();
    await site?.close();
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  it('records navigation, clicks and inputs into a valid, redacted recording.json', async () => {
    app = await PageSession.open(browser.cdp, `${site.baseUrl}/login?session_token=abc123`);
    const ext = await openExtensionPage();

    const started = await message(ext, { type: 'popup/start', tabId: await appTabId(ext) });
    expect(started.error).toBeUndefined();
    await ext.waitFor(`document.getElementById('status').textContent === 'Recording'`);

    await app.bringToFront();
    await app.click('#username');
    await app.type('alice');
    await app.click('#password');
    await app.type('s3cr3t-pass');
    await app.click('#login span');
    await app.waitFor(`location.pathname === '/dashboard' && document.readyState === 'complete'`);
    await delay(CONTENT_SCRIPT_SETTLE_MS);

    await app.click('#settings');
    await app.waitFor(`location.pathname === '/dashboard/settings'`);
    await app.click('#reports');
    await app.waitFor(`location.pathname === '/reports' && document.readyState === 'complete'`);
    await delay(CONTENT_SCRIPT_SETTLE_MS);

    // Stop through the real popup button, which downloads the recording.
    await ext.evaluate(`document.getElementById('stop').click()`);
    const file = await waitForFile(downloadDir, /^recording-127\.0\.0\.1-\d{8}-\d{6}\.json$/).catch(
      async (error: Error) => {
        const diagnostics = await ext.evaluate<string>(`chrome.downloads.search({}).then((items) =>
          JSON.stringify({ popupError: document.getElementById('error').textContent, downloads: items }))`);
        throw new Error(`${error.message}\n${diagnostics}`);
      },
    );
    const json = readFileSync(file, 'utf8');
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(join(OUTPUT_DIR, 'recording.json'), json);

    expect(json.startsWith('{\n  "version": "1.0",\n  "workflow": {\n    "id"')).toBe(true);
    const parsed: unknown = JSON.parse(json);
    const validation = validateRecording(parsed);
    expect(validation.valid ? [] : validation.errors).toEqual([]);
    const recording = parsed as RecordingDocument;

    expect(summarize(recording)).toEqual([
      'navigate /login (initial)',
      'click #username',
      'input #username = alice',
      'click #password',
      'input #password = {{PASSWORD}}',
      'click #login',
      'navigate /dashboard (form_submit)',
      'click #settings',
      'navigate /dashboard/settings (history_api)',
      'click #reports',
      'navigate /reports (link)',
    ]);
    expect(recording.workflow.startUrl).toBe(`${site.baseUrl}/login?session_token={{API_TOKEN}}`);
    expect(recording.actions.map((a) => a.id)).toEqual(
      recording.actions.map((_, i) => `action-${String(i + 1).padStart(3, '0')}`),
    );

    const login = recording.actions[5];
    expect(login).toMatchObject({
      type: 'click',
      title: 'Login',
      target: {
        element: {
          tagName: 'button',
          id: 'login',
          text: 'Log in',
          role: 'button',
          dataAttributes: { 'data-testid': 'login-button' },
          cssSelector: '#login',
          xpath: '/html/body/main/form/button',
          parentPath: 'html > body > main#app > form#login-form',
        },
      },
    });
    if (login?.type === 'click') {
      expect(login.target.element.boundingBox?.width).toBeGreaterThan(0);
    }
    expect(recording.actions[4]).toMatchObject({
      redaction: { variable: 'PASSWORD', reason: 'input type is "password"' },
      target: { element: { label: 'Password', redacted: true } },
    });
    expect(recording.actions[6]).toMatchObject({ title: 'Dashboard' });

    expect(json).not.toContain('s3cr3t');
    expect(json).not.toContain('abc123');

    await ext.waitFor(`document.getElementById('status').textContent === 'Idle'`);
    console.info(recording.actions.map(describeAction).join('\n'));
  });

  it('keeps recording correctly after the extension is reloaded', async () => {
    // Equivalent of pressing "Reload" on chrome://extensions: the unpacked folder is loaded
    // again, the service worker restarts and existing tabs keep orphaned content scripts.
    const reloaded = await browser.cdp.send<{ id: string }>('Extensions.loadUnpacked', {
      path: EXTENSION_DIST,
    });
    expect(reloaded.id).toBe(extensionId);
    await delay(500);

    const ext = await openExtensionPage();
    const status = await message<{ state: string }>(ext, { type: 'popup/get-status' });
    expect(status.data.state).toBe('idle');

    // The /reports tab still hosts the orphaned content script from before the reload.
    const started = await message(ext, { type: 'popup/start', tabId: await appTabId(ext) });
    expect(started.error).toBeUndefined();
    await delay(CONTENT_SCRIPT_SETTLE_MS);

    await app.bringToFront();
    await app.click('#search');
    await app.type('q3');
    await app.click('#export');
    await delay(200);

    const stopped = await message<RecordingDocument>(ext, { type: 'popup/stop' });
    expect(stopped.error).toBeUndefined();
    expect(validateRecording(stopped.data).valid).toBe(true);
    expect(summarize(stopped.data)).toEqual([
      'navigate /reports (initial)',
      'click #search',
      'input #search = q3',
      'click #export',
    ]);
  });
});
