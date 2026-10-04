import { SECRET_VARIABLES, type SecretVariable } from './variables';

/** Plain description of a form field; decoupled from the DOM so the rules stay pure. */
export interface FieldDescriptor {
  tagName: string;
  type?: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  label?: string;
  placeholder?: string;
}

export interface SensitiveFieldMatch {
  variable: SecretVariable;
  reason: string;
}

interface HintRule {
  pattern: RegExp;
  variable: SecretVariable;
}

const AUTOCOMPLETE_RULES: Record<string, SecretVariable> = {
  'current-password': SECRET_VARIABLES.password,
  'new-password': SECRET_VARIABLES.password,
  'one-time-code': SECRET_VARIABLES.oneTimeCode,
  'cc-number': SECRET_VARIABLES.cardNumber,
  'cc-csc': SECRET_VARIABLES.cardSecurityCode,
  'cc-exp': SECRET_VARIABLES.cardExpiry,
  'cc-exp-month': SECRET_VARIABLES.cardExpiry,
  'cc-exp-year': SECRET_VARIABLES.cardExpiry,
};

// Evaluated in order against normalized, space-separated words; first match wins.
const HINT_RULES: readonly HintRule[] = [
  // "pin" is deliberately absent: "PIN code" commonly means a postal code.
  { pattern: /\b(?:password|passwd|passphrase|pwd|pass)\b/, variable: SECRET_VARIABLES.password },
  {
    pattern: /\b(?:cvv2?|cvc2?|csc|card (?:security|verification) code|security code)\b/,
    variable: SECRET_VARIABLES.cardSecurityCode,
  },
  {
    pattern: /\b(?:card ?(?:number|num|no)|cc ?(?:number|num)|credit ?card)\b/,
    variable: SECRET_VARIABLES.cardNumber,
  },
  {
    pattern:
      /\b(?:otp|totp|mfa|2fa|one time (?:code|password)|verification code|auth(?:entication)? code)\b/,
    variable: SECRET_VARIABLES.oneTimeCode,
  },
  { pattern: /\b(?:api ?key|access ?key|private ?key)\b/, variable: SECRET_VARIABLES.apiKey },
  { pattern: /\b(?:token|bearer)\b/, variable: SECRET_VARIABLES.apiToken },
  { pattern: /\b(?:secret|ssn|social security)\b/, variable: SECRET_VARIABLES.secret },
];

/**
 * Splits camelCase, snake_case, kebab-case and dotted identifiers into lowercase words so
 * that `newPassword`, `user_password` and `user-password` all contain the word "password".
 */
export function normalizeHint(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]:]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministically decides whether a field holds a secret and which variable should
 * stand in for its value. Returns `undefined` for non-sensitive fields.
 */
export function classifySensitiveField(field: FieldDescriptor): SensitiveFieldMatch | undefined {
  const type = field.type?.toLowerCase();
  if (type === 'password') {
    return { variable: SECRET_VARIABLES.password, reason: 'input type is "password"' };
  }

  const autocompleteTokens = (field.autocomplete ?? '').toLowerCase().split(/\s+/);
  for (const token of autocompleteTokens) {
    const variable = AUTOCOMPLETE_RULES[token];
    if (variable) return { variable, reason: `autocomplete is "${token}"` };
  }

  const hints: [string, string | undefined][] = [
    ['name', field.name],
    ['id', field.id],
    ['label', field.label],
    ['placeholder', field.placeholder],
  ];
  for (const rule of HINT_RULES) {
    for (const [source, hint] of hints) {
      if (!hint) continue;
      const match = rule.pattern.exec(normalizeHint(hint));
      if (match) {
        return { variable: rule.variable, reason: `${source} contains "${match[0]}"` };
      }
    }
  }
  return undefined;
}
