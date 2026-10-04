/**
 * Serializes a string as a CSS identifier, following the CSSOM `CSS.escape()` algorithm.
 * Implemented locally because `CSS.escape` is unavailable in some test environments.
 */
export function cssEscape(value: string): string {
  let result = '';
  const length = value.length;
  const first = value.charCodeAt(0);

  for (let i = 0; i < length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0) {
      result += '\uFFFD';
    } else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && first === 0x2d)
    ) {
      result += `\\${code.toString(16)} `;
    } else if (i === 0 && length === 1 && code === 0x2d) {
      result += `\\${value.charAt(i)}`;
    } else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      result += value.charAt(i);
    } else {
      result += `\\${value.charAt(i)}`;
    }
  }
  return result;
}
