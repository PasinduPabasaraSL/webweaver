export const SECRET_VARIABLES = {
  password: 'PASSWORD',
  oneTimeCode: 'OTP',
  cardNumber: 'CARD_NUMBER',
  cardSecurityCode: 'CARD_CVC',
  cardExpiry: 'CARD_EXPIRY',
  apiToken: 'API_TOKEN',
  apiKey: 'API_KEY',
  sessionId: 'SESSION_ID',
  secret: 'SECRET',
} as const;

/** Stand-in for values that are dropped entirely rather than parameterized (e.g. CSRF tokens). */
export const REDACTED_PLACEHOLDER = '{{REDACTED}}';

export type SecretVariable = (typeof SECRET_VARIABLES)[keyof typeof SECRET_VARIABLES];

/** Formats a variable reference as it appears in recordings, e.g. `{{PASSWORD}}`. */
export function formatVariable(name: string): string {
  return `{{${name}}}`;
}
