import type { CdpClient } from './cdp';

interface EvaluateResult {
  result: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A page target attached through a flattened CDP session. Input is dispatched as trusted events. */
export class PageSession {
  constructor(
    private readonly cdp: CdpClient,
    readonly targetId: string,
    private readonly sessionId: string,
  ) {}

  static async open(cdp: CdpClient, url: string): Promise<PageSession> {
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url });
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const page = new PageSession(cdp, targetId, sessionId);
    await page.waitFor(`document.readyState === 'complete'`);
    return page;
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.cdp.send<EvaluateResult>(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId,
    );
    if (response.exceptionDetails) {
      const detail =
        response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error(`Evaluation failed: ${detail}`);
    }
    return response.result.value as T;
  }

  /** Polls until `expression` is truthy; navigation-related evaluation errors are retried. */
  async waitFor(expression: string, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: string | undefined;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(`Boolean(${expression})`)) return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : JSON.stringify(error);
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for ${expression}${lastError ? ` (${lastError})` : ''}`);
  }

  async bringToFront(): Promise<void> {
    await this.cdp.send('Page.bringToFront', {}, this.sessionId);
  }

  async click(selector: string): Promise<void> {
    const point = await this.evaluate<{ x: number; y: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!point) throw new Error(`No element matches ${selector}`);
    const base = { x: point.x, y: point.y, button: 'left', clickCount: 1 };
    await this.cdp.send(
      'Input.dispatchMouseEvent',
      { ...base, type: 'mouseMoved' },
      this.sessionId,
    );
    await this.cdp.send(
      'Input.dispatchMouseEvent',
      { ...base, type: 'mousePressed' },
      this.sessionId,
    );
    await this.cdp.send(
      'Input.dispatchMouseEvent',
      { ...base, type: 'mouseReleased' },
      this.sessionId,
    );
  }

  /** Types one character at a time so each keystroke produces its own input event. */
  async type(text: string): Promise<void> {
    for (const char of text) {
      await this.cdp.send('Input.insertText', { text: char }, this.sessionId);
    }
  }
}
