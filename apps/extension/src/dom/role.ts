const INPUT_ROLES: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
};

const TAG_ROLES: Record<string, string> = {
  button: 'button',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  nav: 'navigation',
  main: 'main',
  form: 'form',
  table: 'table',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  dialog: 'dialog',
  option: 'option',
};

/** Subset of the HTML-AAM implicit role mapping, covering the elements users interact with. */
function implicitRole(element: Element): string | undefined {
  const tag = element.localName;
  if (tag === 'a' || tag === 'area') return element.hasAttribute('href') ? 'link' : undefined;
  if (tag === 'img') return element.getAttribute('alt') === '' ? 'presentation' : 'img';
  if (tag === 'select') {
    const size = Number(element.getAttribute('size') ?? '0');
    return element.hasAttribute('multiple') || size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (element.hasAttribute('list') && INPUT_ROLES[type] === 'textbox') return 'combobox';
    return INPUT_ROLES[type];
  }
  return TAG_ROLES[tag];
}

export function getRole(element: Element): string | undefined {
  const explicit = element.getAttribute('role')?.trim().split(/\s+/)[0];
  return explicit || implicitRole(element);
}
