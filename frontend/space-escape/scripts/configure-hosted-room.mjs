import { writeFile } from 'node:fs/promises';

// Keep the deployment endpoint in Vercel's environment, independent of source assets.
const value = process.env.SPACE_ROOM_URL;
if (!value) throw new Error('Set SPACE_ROOM_URL to the public PartyKit endpoint.');
const endpoint = new URL(value);
if (!['https:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error('SPACE_ROOM_URL must be an https:// or wss:// PartyKit URL without credentials, a query, or a fragment.');

await writeFile(new URL('../dist/connection.json', import.meta.url), JSON.stringify({ url: endpoint.href }) + '\n');
console.log('Configured the hosted multiplayer room endpoint.');
