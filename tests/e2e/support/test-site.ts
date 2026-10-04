import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

const PAGES: Record<string, string> = {
  '/login': page(
    'Login',
    `<main id="app">
      <form id="login-form" method="post" action="/login">
        <label for="username">Username</label>
        <input id="username" name="username" autocomplete="username">
        <label for="password">Password</label>
        <input id="password" name="password" type="password">
        <button id="login" data-testid="login-button" type="submit"><span>Log in</span></button>
      </form>
    </main>`,
  ),
  '/dashboard': page(
    'Dashboard',
    `<nav><a id="reports" href="/reports">Reports</a></nav>
     <button id="settings" type="button"
             onclick="history.pushState({}, '', '/dashboard/settings')">Open settings</button>`,
  ),
  '/reports': page(
    'Reports',
    `<input id="search" type="search" aria-label="Search reports">
     <button id="export" class="btn btn-export">Export CSV</button>`,
  ),
};

/** Tiny deterministic website: login form (POST + 303 redirect), SPA navigation and a link. */
export async function startTestSite(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    if (request.method === 'POST' && path === '/login') {
      request.resume();
      request.on('end', () => {
        response.writeHead(303, { Location: '/dashboard' }).end();
      });
      return;
    }
    const html = PAGES[path];
    if (!html) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
