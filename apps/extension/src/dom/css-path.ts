import { cssEscape } from './css-escape';

type QueryRoot = Document | DocumentFragment;

function queryRootOf(element: Element): QueryRoot {
  const root = element.getRootNode();
  return root instanceof Document || root instanceof DocumentFragment
    ? root
    : element.ownerDocument;
}

function isUniqueId(root: QueryRoot, id: string): boolean {
  try {
    return root.querySelectorAll(`#${cssEscape(id)}`).length === 1;
  } catch {
    return false;
  }
}

function nthOfTypeSuffix(element: Element): string {
  const parent = element.parentElement;
  if (!parent) return '';
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === element.tagName);
  if (sameTag.length <= 1) return '';
  return `:nth-of-type(${sameTag.indexOf(element) + 1})`;
}

/**
 * Builds a structural CSS selector anchored at the nearest ancestor with a unique id
 * (or the root). This is the baseline selector; ranked alternatives come in Milestone 2.
 */
export function buildCssPath(element: Element): string {
  const root = queryRootOf(element);
  const parts: string[] = [];
  let current: Element | null = element;

  while (current) {
    if (current.id && isUniqueId(root, current.id)) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }
    parts.unshift(cssEscape(current.localName) + nthOfTypeSuffix(current));
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/** Human-readable ancestor chain from the root down to the element's parent. */
export function buildParentPath(element: Element, maxClassesPerSegment = 2): string {
  const segments: string[] = [];
  let current = element.parentElement;
  while (current) {
    let segment = current.localName;
    if (current.id) segment += `#${current.id}`;
    const classes = Array.from(current.classList).slice(0, maxClassesPerSegment);
    if (classes.length > 0) segment += `.${classes.join('.')}`;
    segments.unshift(segment);
    current = current.parentElement;
  }
  return segments.join(' > ');
}
