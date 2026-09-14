import { writeFile } from 'node:fs/promises';

// Keep the deployment endpoint in Vercel's environment, independent of source assets.
const value = process.env.SPACE_ROOM_URL;
if (!value) throw new Error('Set SPACE_ROOM_URL to the public wss:// room endpoint.');
const endpoint = new URL(value);
if (endpoint.protocol !== 'wss:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error('SPACE_ROOM_URL must be a wss:// URL without credentials, a query, or a fragment.');

await writeFile(new URL('../dist/connection.json', import.meta.url), JSON.stringify({ url: endpoint.href }) + '\n');
console.log('Configured the hosted multiplayer room endpoint.');
