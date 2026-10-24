/**
 * Local adapter for Vainah VPN existing Request -> Response functions.
 * The public server is Python/FastAPI; Node only runs on localhost during migration.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const functions = join(root, 'netlify', 'functions');
const port = Number(process.env.VAINAH_BRIDGE_PORT || '18787');
const origin = process.env.PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:8000';
const maxBytes = 1_048_576;
const bridgeSecret = process.env.VAINAH_BRIDGE_SECRET || '';
if (bridgeSecret.length < 32) throw Error('Missing internal bridge secret');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid bridge port');
if (!/^https?:\/\//.test(origin)) throw Error('PUBLIC_SITE_ORIGIN must be http(s)');
const handlers = new Map();

createServer(async (incoming, outgoing) => {
  try {
    if (incoming.headers['x-vainah-internal-key'] !== bridgeSecret) {
      outgoing.writeHead(403); outgoing.end(); return;
    }
    const target = new URL(incoming.url || '/', 'http://localhost');
    if (target.pathname === '/__bridge_health') {
      outgoing.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      outgoing.end('{"ok":true}'); return;
    }
    const name = target.pathname.slice(1);
    if (!/^[a-z0-9][a-z0-9-]{0,70}$/.test(name)) {
      outgoing.writeHead(404); outgoing.end(); return;
    }
    const filepath = join(functions, name + '.mjs');
    if (!existsSync(filepath)) { outgoing.writeHead(404); outgoing.end(); return; }
    let size = 0;
    const chunks = [];
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > maxBytes) {
        outgoing.writeHead(413, { 'content-type': 'application/json' });
        outgoing.end('{"error":"Too large"}'); return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    let handler = handlers.get(name);
    if (!handler) {
      const loaded = await import(pathToFileURL(filepath).href);
      handler = loaded.default;
      if (typeof handler !== 'function') throw Error('Invalid handler');
      handlers.set(name, handler);
    }
    const url = new URL(target.pathname.replace(/^\//, '/.netlify/functions/') + target.search, origin);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (key === 'host' || key === 'connection' || key === 'transfer-encoding' || key === 'x-vainah-internal-key' || value === undefined) continue;
      if (Array.isArray(value)) for (const item of value) headers.append(key, item);
      else headers.set(key, value);
    }
    const options = { method: incoming.method, headers };
    if (body.length && !['GET', 'HEAD'].includes(incoming.method)) {
      options.body = body;
      options.duplex = 'half';
    }
    const result = await handler(new Request(url, options));
    if (!(result instanceof Response)) throw Error('Handler did not return a Response');
    const resultHeaders = {};
    for (const [key, value] of result.headers.entries()) {
      if (key !== 'set-cookie' && key !== 'content-length') resultHeaders[key] = value;
    }
    const cookies = result.headers.getSetCookie?.() || [];
    if (cookies.length) resultHeaders['set-cookie'] = cookies;
    outgoing.writeHead(result.status, resultHeaders);
    if (incoming.method === 'HEAD') outgoing.end();
    else outgoing.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    console.error('Vainah legacy worker:', error?.name || 'Error');
    if (!outgoing.headersSent) outgoing.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    outgoing.end('{"error":"Service unavailable"}');
  }
}).listen(port, '127.0.0.1', () => console.log('Vainah compatibility worker ready on loopback'));
