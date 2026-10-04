import { describe, expect, it } from 'vitest';
import { classifySensitiveField, normalizeHint } from '../src';

describe('normalizeHint', () => {
  it('splits identifiers into lowercase words', () => {
    expect(normalizeHint('newPassword')).toBe('new password');
    expect(normalizeHint('user_pass-word.field')).toBe('user pass word field');
    expect(normalizeHint('user[cardNumber]')).toBe('user card number');
  });
});

describe('classifySensitiveField', () => {
  it('flags password inputs regardless of other hints', () => {
    expect(classifySensitiveField({ tagName: 'input', type: 'PASSWORD', name: 'q' })).toEqual({
      variable: 'PASSWORD',
      reason: 'input type is "password"',
    });
  });

  it('uses autocomplete tokens', () => {
    expect(
      classifySensitiveField({
        tagName: 'input',
        type: 'text',
        autocomplete: 'section-a one-time-code',
      }),
    ).toEqual({ variable: 'OTP', reason: 'autocomplete is "one-time-code"' });
    expect(classifySensitiveField({ tagName: 'input', autocomplete: 'cc-csc' })?.variable).toBe(
      'CARD_CVC',
    );
  });

  it('catches a password field whose type was toggled to text', () => {
    expect(classifySensitiveField({ tagName: 'input', type: 'text', id: 'userPassword' })).toEqual({
      variable: 'PASSWORD',
      reason: 'id contains "password"',
    });
  });

  it('uses labels and placeholders', () => {
    expect(classifySensitiveField({ tagName: 'input', label: 'Card number' })?.variable).toBe(
      'CARD_NUMBER',
    );
    expect(classifySensitiveField({ tagName: 'input', placeholder: 'Enter CVV' })?.variable).toBe(
      'CARD_CVC',
    );
    expect(classifySensitiveField({ tagName: 'input', name: 'api_key' })?.variable).toBe('API_KEY');
    expect(classifySensitiveField({ tagName: 'input', name: 'mfaCode' })?.variable).toBe('OTP');
  });

  it('leaves ordinary fields alone', () => {
    for (const name of ['username', 'email', 'search', 'passenger', 'pincode', 'compass']) {
      expect(classifySensitiveField({ tagName: 'input', type: 'text', name })).toBeUndefined();
    }
    expect(classifySensitiveField({ tagName: 'input', label: 'PIN code' })).toBeUndefined();
  });
});
