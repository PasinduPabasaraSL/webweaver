/**
 * Runs async tasks one at a time in submission order. Every state mutation goes through
 * this queue so concurrent messages (e.g. keystrokes arriving during a navigation) cannot
 * interleave their load/modify/save cycles and lose actions.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
