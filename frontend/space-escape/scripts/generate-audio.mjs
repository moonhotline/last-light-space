import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../public/assets/', import.meta.url));
await mkdir(out, { recursive: true });
const rate = 22050;
function wav(duration, sample) {
  const count = Math.floor(duration * rate), b = Buffer.alloc(44 + count * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample(i / rate, i))) * 32700), 44 + i * 2);
  return b;
}
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const notes = [110, 130.813, 164.814, 146.832, 110, 130.813, 196, 164.814];
await writeFile(out + 'orbit.wav', wav(32, t => {
  const chord = Math.floor(t / 8), root = [55, 65.406, 73.416, 65.406][chord];
  const beat = t % 0.5, n = notes[Math.floor(t * 2) % notes.length];
  const arp = (sine(n * 2, t) + sine(n * 4, t) * 0.3) * Math.exp(-beat * 9) * 0.085;
  const pad = (sine(root, t) + sine(root * 1.5, t) * 0.4 + sine(root * 2.002, t) * 0.25) * 0.05;
  const kickT = t % 1, kick = sine(44 + 40 * Math.exp(-kickT * 30), kickT) * Math.exp(-kickT * 13) * 0.08;
  return (pad + arp + kick) * Math.min(1, t, 32 - t);
}));
await writeFile(out + 'pulse.wav', wav(0.5, t => sine(180 - t * 220, t) * Math.exp(-t * 10) * 0.45 + sine(840, t) * Math.exp(-t * 30) * 0.15));
await writeFile(out + 'scan.wav', wav(1.2, t => sine(420 + t * 600, t) * Math.sin(t * Math.PI / 1.2) * 0.13));
await writeFile(out + 'chime.wav', wav(0.7, t => (sine(660, t) + sine(880, t) * 0.5) * Math.exp(-t * 7) * 0.18));
await writeFile(out + 'drone.wav', wav(2, t => (sine(72, t) + sine(144, t) * 0.4) * (0.08 + 0.03 * sine(4, t))));
console.log('Generated five original PCM audio assets.');
