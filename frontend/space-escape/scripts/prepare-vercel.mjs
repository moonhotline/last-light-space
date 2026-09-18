import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const value = process.argv[2] || process.env.SPACE_ROOM_URL;
if (!value) throw new Error('Pass the public PartyKit URL as the first argument.');
const endpoint = new URL(value);
if (!['https:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error('Use a public https:// or wss:// PartyKit URL without credentials, a query, or a fragment.');
const health = new URL('/parties/main/_health', endpoint);
health.protocol = 'https:';
const response = await fetch(health, { signal: AbortSignal.timeout(15000) });
const status = await response.json();
if (!response.ok || status.game !== 'last-light' || status.transport !== 'partykit')
  throw new Error('The public room service did not pass its health check.');

const gameRoot = new URL('../', import.meta.url);
const dist = new URL('dist/', gameRoot);
await readFile(new URL('index.html', dist));
const output = new URL('.vercel/output/', gameRoot);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(dist, new URL('static/', output), { recursive: true });
await writeFile(new URL('static/connection.json', output), JSON.stringify({ url: endpoint.href }) + '\n');
await writeFile(new URL('config.json', output), JSON.stringify({
  version: 3,
  routes: [
    { src: '/connection.json', headers: { 'Cache-Control': 'no-store' }, continue: true },
    { handle: 'filesystem' },
  ],
}, null, 2) + '\n');
console.log(`Prepared static-only Vercel output at ${fileURLToPath(output)}`);
console.log(`Room service: ${endpoint.href}`);
