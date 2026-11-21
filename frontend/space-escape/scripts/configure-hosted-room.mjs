import { writeFile } from 'node:fs/promises';

// Vercel previews use the public PartyKit endpoint unless the deployment overrides it.
const value = process.env.SPACE_ROOM_URL || 'https://party.oodai.space';
const endpoint = new URL(value);
if (!['https:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash)
  throw new Error('SPACE_ROOM_URL must be an https:// or wss:// PartyKit URL without credentials, a query, or a fragment.');

await writeFile(new URL('../dist/connection.json', import.meta.url), JSON.stringify({
  url: endpoint.href,
  transport: 'partyserver',
}) + '\n');
console.log('Configured the hosted multiplayer room endpoint.');
