const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function stepName(element: Element): string {
  // Non-HTML elements (SVG, MathML) do not match plain name tests in HTML documents.
  return element.namespaceURI === XHTML_NAMESPACE
    ? element.localName
    : `*[local-name()="${element.localName}"]`;
}

function stepIndex(element: Element): string {
  const parent = element.parentElement;
  if (!parent) return '';
  const sameName = Array.from(parent.children).filter(
    (c) => c.localName === element.localName && c.namespaceURI === element.namespaceURI,
  );
  if (sameName.length <= 1) return '';
  return `[${sameName.indexOf(element) + 1}]`;
}

/** Absolute, index-based XPath such as `/html/body/div[2]/form/input[1]`. */
export function buildXPath(element: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current) {
    steps.unshift(stepName(current) + stepIndex(current));
    current = current.parentElement;
  }
  return '/' + steps.join('/');
}
