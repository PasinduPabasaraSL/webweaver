/**
 * Assigns each element a key that stays stable for the lifetime of the page, even when
 * surrounding DOM changes would alter its XPath (e.g. a validation message is inserted).
 */
export class ElementKeys {
  private readonly keys = new WeakMap<Element, string>();
  private counter = 0;

  constructor(private readonly prefix: string) {}

  keyFor(element: Element): string {
    let key = this.keys.get(element);
    if (!key) {
      this.counter += 1;
      key = `${this.prefix}:${this.counter}`;
      this.keys.set(element, key);
    }
    return key;
  }
}
