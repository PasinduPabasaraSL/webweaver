import { formatVariable, SECRET_VARIABLES, type SecretVariable } from './variables';

const EXACT_PARAMS: Record<string, SecretVariable> = {
  pwd: SECRET_VARIABLES.password,
  pass: SECRET_VARIABLES.password,
  auth: SECRET_VARIABLES.apiToken,
  authorization: SECRET_VARIABLES.apiToken,
  jwt: SECRET_VARIABLES.apiToken,
  bearer: SECRET_VARIABLES.apiToken,
  apikey: SECRET_VARIABLES.apiKey,
  api_key: SECRET_VARIABLES.apiKey,
  x_api_key: SECRET_VARIABLES.apiKey,
  session: SECRET_VARIABLES.sessionId,
  sessionid: SECRET_VARIABLES.sessionId,
  session_id: SECRET_VARIABLES.sessionId,
  sid: SECRET_VARIABLES.sessionId,
  phpsessid: SECRET_VARIABLES.sessionId,
  jsessionid: SECRET_VARIABLES.sessionId,
  otp: SECRET_VARIABLES.oneTimeCode,
  sig: SECRET_VARIABLES.secret,
  signature: SECRET_VARIABLES.secret,
  x_amz_signature: SECRET_VARIABLES.secret,
  x_amz_credential: SECRET_VARIABLES.secret,
  x_amz_security_token: SECRET_VARIABLES.secret,
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Returns the variable a query parameter's value should be replaced with, if any. */
export function sensitiveParamVariable(rawName: string): SecretVariable | undefined {
  const name = safeDecode(rawName).toLowerCase().replace(/-/g, '_');
  const exact = EXACT_PARAMS[name];
  if (exact) return exact;
  if (name.includes('password') || name.includes('passwd')) return SECRET_VARIABLES.password;
  if (name.endsWith('token')) return SECRET_VARIABLES.apiToken;
  if (name.includes('secret')) return SECRET_VARIABLES.secret;
  return undefined;
}

function redactParams(params: string): string {
  return params
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      const variable = sensitiveParamVariable(name);
      return variable ? `${name}=${formatVariable(variable)}` : pair;
    })
    .join('&');
}

/**
 * Replaces secrets embedded in a URL (userinfo passwords, sensitive query or fragment
 * parameters) with variable placeholders. Works on the raw string rather than `URL` so the
 * rest of the URL is preserved byte-for-byte as recorded evidence.
 */
export function redactUrl(url: string): string {
  let result = url.replace(
    /^([a-z][a-z0-9+.-]*:\/\/)([^/?#@:]*):([^/?#@]*)@/i,
    (_match, scheme: string, user: string) =>
      `${scheme}${user}:${formatVariable(SECRET_VARIABLES.password)}@`,
  );

  const hashIndex = result.indexOf('#');
  let fragment = '';
  if (hashIndex !== -1) {
    fragment = result.slice(hashIndex + 1);
    result = result.slice(0, hashIndex);
  }

  const queryIndex = result.indexOf('?');
  if (queryIndex !== -1) {
    result = result.slice(0, queryIndex + 1) + redactParams(result.slice(queryIndex + 1));
  }

  if (hashIndex !== -1) result += '#' + redactFragment(fragment);
  return result;
}

/** Handles OAuth-style `#a=b&c=d` fragments and hash-router `#/route?a=b` fragments. */
function redactFragment(fragment: string): string {
  const queryIndex = fragment.indexOf('?');
  if (queryIndex !== -1) {
    return fragment.slice(0, queryIndex + 1) + redactParams(fragment.slice(queryIndex + 1));
  }
  return fragment.includes('=') ? redactParams(fragment) : fragment;
}
