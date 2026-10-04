import { describe, expect, it } from 'vitest';
import { redactUrl, sensitiveParamVariable } from '../src';

describe('sensitiveParamVariable', () => {
  it('maps parameter names to variables', () => {
    expect(sensitiveParamVariable('password')).toBe('PASSWORD');
    expect(sensitiveParamVariable('new_password')).toBe('PASSWORD');
    expect(sensitiveParamVariable('access_token')).toBe('API_TOKEN');
    expect(sensitiveParamVariable('CSRF-Token')).toBe('API_TOKEN');
    expect(sensitiveParamVariable('client_secret')).toBe('SECRET');
    expect(sensitiveParamVariable('api-key')).toBe('API_KEY');
    expect(sensitiveParamVariable('X-Amz-Signature')).toBe('SECRET');
    expect(sensitiveParamVariable('PHPSESSID')).toBe('SESSION_ID');
  });

  it('ignores ordinary parameters', () => {
    for (const name of ['q', 'page', 'sort', 'code', 'key', 'tokens_count']) {
      expect(sensitiveParamVariable(name)).toBeUndefined();
    }
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query parameters and keeps the rest byte-for-byte', () => {
    expect(redactUrl('https://example.com/login?next=%2Fhome&password=secret&q=a+b')).toBe(
      'https://example.com/login?next=%2Fhome&password={{PASSWORD}}&q=a+b',
    );
  });

  it('redacts userinfo passwords', () => {
    expect(redactUrl('https://alice:hunter2@example.com/x')).toBe(
      'https://alice:{{PASSWORD}}@example.com/x',
    );
    expect(redactUrl('https://alice@example.com/x')).toBe('https://alice@example.com/x');
  });

  it('redacts OAuth-style fragments', () => {
    expect(redactUrl('https://app.test/cb#access_token=abc.def&token_type=bearer')).toBe(
      'https://app.test/cb#access_token={{API_TOKEN}}&token_type=bearer',
    );
  });

  it('redacts query strings inside hash-router fragments', () => {
    expect(redactUrl('https://app.test/#/reset?reset_token=xyz&step=2')).toBe(
      'https://app.test/#/reset?reset_token={{API_TOKEN}}&step=2',
    );
  });

  it('leaves plain fragments and URLs without secrets unchanged', () => {
    for (const url of [
      'https://example.com/',
      'https://example.com/docs#section-2',
      'https://example.com/search?q=token',
      'about:blank',
    ]) {
      expect(redactUrl(url)).toBe(url);
    }
  });

  it('is idempotent', () => {
    const once = redactUrl('https://u:p@x.test/?token=1#sid=2');
    expect(redactUrl(once)).toBe(once);
  });
});
