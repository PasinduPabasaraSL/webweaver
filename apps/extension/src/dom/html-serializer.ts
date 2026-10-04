import { truncate } from '@webweaver/core';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

const OPAQUE_CONTENT = new Set(['script', 'style', 'noscript', 'template']);

const MAX_ATTRIBUTE_LENGTH = 200;

export interface SerializeOptions {
  maxLength: number;
  /** Returns a replacement for an attribute value, or undefined to keep it. */
  redactAttribute: (element: Element, name: string, value: string) => string | undefined;
  /** Returns true when an element's children must not be serialized (e.g. a secret textarea). */
  hideChildren: (element: Element) => boolean;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Serializes an element to HTML with a hard length budget and attribute-level redaction.
 * Unlike `outerHTML`, it stops walking once the budget is spent, so clicking a huge
 * container stays cheap, and secrets never enter the output string in the first place.
 */
export function serializeElement(root: Element, options: SerializeOptions): string {
  let output = '';
  let truncated = false;

  const write = (chunk: string): void => {
    if (truncated) return;
    const remaining = options.maxLength - output.length;
    if (chunk.length > remaining) {
      output += chunk.slice(0, remaining);
      truncated = true;
    } else {
      output += chunk;
    }
  };

  const visit = (node: Node): void => {
    if (truncated) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (text) write(escapeText(text));
      return;
    }
    if (!(node instanceof Element)) return;

    const tag = node.localName;
    write(`<${tag}`);
    for (const attribute of Array.from(node.attributes)) {
      const value =
        options.redactAttribute(node, attribute.name, attribute.value) ??
        truncate(attribute.value, MAX_ATTRIBUTE_LENGTH);
      write(` ${attribute.name}="${escapeAttribute(value)}"`);
    }
    write('>');
    if (VOID_ELEMENTS.has(tag)) return;
    if (!OPAQUE_CONTENT.has(tag) && !options.hideChildren(node)) {
      node.childNodes.forEach(visit);
    }
    write(`</${tag}>`);
  };

  visit(root);
  return truncated ? `${output}…` : output;
}
