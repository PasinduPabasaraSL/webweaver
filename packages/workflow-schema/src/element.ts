export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Deterministic description of a DOM element captured at interaction time.
 * Values of sensitive form fields are replaced by variable placeholders (see `redacted`).
 */
export interface ElementSnapshot {
  tagName: string;

  id?: string;
  name?: string;
  type?: string;
  text?: string;
  value?: string;
  /** Text of the associated <label>, aria-labelledby, aria-label, alt or title. */
  label?: string;

  classes: string[];

  /** Explicit `role` attribute, or the implicit ARIA role for common elements. */
  role?: string;

  ariaAttributes: Record<string, string>;
  dataAttributes: Record<string, string>;
  attributes: Record<string, string>;

  cssSelector?: string;
  xpath?: string;
  /** Ancestor chain from <html> to the direct parent, e.g. `html > body > form#login`. */
  parentPath?: string;

  boundingBox?: BoundingBox;

  outerHTML?: string;

  /** True when value-bearing fields of this snapshot were replaced with placeholders. */
  redacted?: boolean;
}
