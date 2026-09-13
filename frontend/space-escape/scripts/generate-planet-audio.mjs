import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const out = fileURLToPath(new URL("../public/assets/", import.meta.url)),
  rate = 22050,
  duration = 48;
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
function wav(sample) {
  const count = rate * duration,
    b = Buffer.alloc(44 + count * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t / 2, (duration - t) / 2);
    b.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample(t) * envelope)) * 32700),
      44 + i * 2,
    );
  }
  return b;
}
const roots = [73.416, 65.406, 87.307, 73.416],
  chord = (t) => roots[Math.floor(t / 12)];
await writeFile(
  out + "planet-ambient.wav",
  wav((t) => {
    const root = chord(t),
      fade = Math.sin((Math.PI * (t % 12)) / 12) ** 0.3;
    return (
      fade *
      (sine(root, t) * 0.1 +
        sine(root * 1.501, t) * 0.055 +
        sine(root * 2.001, t) * 0.035 +
        sine(root * 0.5, t) * 0.05) *
      (1 + 0.13 * sine(0.125, t))
    );
  }),
);
await writeFile(
  out + "planet-awake.wav",
  wav((t) => {
    const root = chord(t),
      sequence = [2, 3, 4, 3, 2.5, 3, 4, 6],
      beat = t % 1.5,
      f = sequence[Math.floor(t / 1.5) % 8] * root;
    const harp =
      (sine(f, t) + sine(f * 2.002, t) * 0.23) * Math.exp(-beat * 2.5) * 0.18;
    const echo = (sine(f * 0.5, t) + sine(f * 0.75, t)) * 0.025;
    return harp + echo;
  }),
);
await writeFile(
  out + "planet-finale.wav",
  wav((t) => {
    const root = chord(t),
      beat = t % 3,
      n = [4, 3, 2, 2.5, 3, 4, 6, 4][Math.floor(t / 3) % 8];
    return (
      (sine(root * n, t) + sine(root * n * 1.001, t)) *
        0.08 *
        Math.sin((Math.PI * beat) / 3) ** 0.7 +
      (sine(root * 2, t) + sine(root * 3, t)) * 0.045
    );
  }),
);
console.log("Three original 48-second layered expedition scores generated.");
