/** Replaces the jsdom document body and returns a typed element lookup. */
export function mount(html: string): <T extends Element = HTMLElement>(selector: string) => T {
  document.body.innerHTML = html;
  return <T extends Element = HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Fixture is missing ${selector}`);
    return element;
  };
}

/** Simulates a user typing by setting the value one character at a time. */
export function typeInto(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  for (const char of text) {
    element.value += char;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
  }
}

export function click(element: Element, init: MouseEventInit = {}): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
}
