import type { BackgroundRequest, Response, ResponseMap } from './messages';

export class BackgroundError extends Error {
  override readonly name = 'BackgroundError';
}

type SendMessage = (message: unknown) => Promise<unknown>;

/**
 * Sends a typed request to the background service worker and unwraps its response.
 * `send` is injectable so callers can be tested without the Chrome runtime.
 */
export async function requestBackground<T extends BackgroundRequest>(
  request: T,
  send: SendMessage = (message) => chrome.runtime.sendMessage(message),
): Promise<ResponseMap[T['type']]> {
  const response = (await send(request)) as Response<ResponseMap[T['type']]> | undefined;
  if (!response) throw new BackgroundError('No response from the WebWeaver background worker.');
  if (!response.ok) throw new BackgroundError(response.error);
  return response.data;
}
