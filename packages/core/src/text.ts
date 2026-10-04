const ELLIPSIS = '…';

/** Collapses runs of whitespace into single spaces and trims the ends. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Truncates to at most `maxLength` characters, marking truncation with an ellipsis. */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, Math.max(0, maxLength - ELLIPSIS.length)) + ELLIPSIS;
}
