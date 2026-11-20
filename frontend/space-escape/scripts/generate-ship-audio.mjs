/**
 * Last Light - High-Fidelity 44.1kHz Ship Propulsion & Retro-Brake Audio Generator
 * Synthesizes seamless multi-layer engine loops, afterburner ignition punch,
 * pneumatic cold-gas retro-brake acoustics, and hull collision impacts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../public/assets/audio/", import.meta.url));
await mkdir(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const TAU = Math.PI * 2;

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 4294967296) * 2 - 1;
  };
}

function softClip(x, drive = 1.4) {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

/** Second-order biquad filter for clean resonant sculpting. */
class Biquad {
  constructor(type, freq, q = 0.707) {
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
    this.set(type, freq, q);
  }
  set(type, freq, q = 0.707) {
    const f = Math.max(20, Math.min(SAMPLE_RATE * 0.45, freq));
    const w0 = (TAU * f) / SAMPLE_RATE;
    const c = Math.cos(w0);
    const s = Math.sin(w0);
    const alpha = s / (2 * Math.max(0.05, q));
    let b0, b1, b2, a0, a1, a2;
    if (type === "lowpass") {
      b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
    } else if (type === "highpass") {
      b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * c; a2 = 1 - alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Generate seamless loopable stereo PCM by synthesizing extra tail and equal-power crossfading. */
function renderStereoLoop(durationSec, renderSample) {
  const frames = Math.floor(durationSec * SAMPLE_RATE);
  const fade = Math.floor(0.28 * SAMPLE_RATE);
  const total = frames + fade;
  const rawL = new Float32Array(total);
  const rawR = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const [l, r] = renderSample(i / SAMPLE_RATE, i, durationSec);
    rawL[i] = l;
    rawR[i] = r;
  }
  const outL = new Float32Array(frames);
  const outR = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    if (i < fade) {
      const k = i / fade;
      const gIn = Math.sin(k * Math.PI * 0.5);
      const gOut = Math.cos(k * Math.PI * 0.5);
      outL[i] = rawL[i] * gIn + rawL[frames + i] * gOut;
      outR[i] = rawR[i] * gIn + rawR[frames + i] * gOut;
    } else {
      outL[i] = rawL[i];
      outR[i] = rawR[i];
    }
  }
  return encodeWavStereo(outL, outR);
}

function renderStereoOneShot(durationSec, renderSample) {
  const frames = Math.floor(durationSec * SAMPLE_RATE);
  const outL = new Float32Array(frames);
  const outR = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const [l, r] = renderSample(i / SAMPLE_RATE, i, durationSec);
    outL[i] = l;
    outR[i] = r;
  }
  return encodeWavStereo(outL, outR);
}

function encodeWavStereo(left, right) {
  const frames = left.length;
  const channels = 2;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(Math.round(l * 32700), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32700), 44 + i * 4 + 2);
  }
  return buf;
}

// 1. Engine Idle Loop (warm deep fusion core hum + gentle magnetic containment shimmer)
{
  const rngL = createRng(101);
  const rngR = createRng(202);
  const lpL = new Biquad("lowpass", 175, 1.1);
  const lpR = new Biquad("lowpass", 185, 1.1);
  const wav = renderStereoLoop(4.0, (t) => {
    const breathe = 0.88 + 0.12 * Math.sin(TAU * 0.5 * t);
    const f0 = 42;
    const core =
      Math.sin(TAU * f0 * t) * 0.42 +
      Math.sin(TAU * (f0 * 1.5) * t + 0.4) * 0.18 +
      Math.sin(TAU * (f0 * 2.0) * t) * 0.14 +
      Math.sin(TAU * (f0 * 3.0) * t) * 0.05;
    const shimmerL = Math.sin(TAU * 168 * t) * (0.04 + 0.02 * Math.sin(TAU * 0.75 * t));
    const shimmerR = Math.sin(TAU * 168.5 * t + 1.1) * (0.04 + 0.02 * Math.cos(TAU * 0.75 * t));
    const airL = lpL.process(rngL()) * 0.22;
    const airR = lpR.process(rngR()) * 0.22;
    const l = softClip((core * breathe + shimmerL + airL) * 0.65, 1.15);
    const r = softClip((core * breathe + shimmerR + airR) * 0.65, 1.15);
    return [l, r];
  });
  await writeFile(outDir + "engine-idle-loop.wav", wav);
}

// 2. Engine Cruise Loop (layered laminar ion thrust + turbine harmonics + deep hull resonance)
{
  const rngL = createRng(303);
  const rngR = createRng(404);
  const jetBpL = new Biquad("bandpass", 360, 0.9);
  const jetBpR = new Biquad("bandpass", 390, 0.9);
  const subLpL = new Biquad("lowpass", 140, 1.4);
  const subLpR = new Biquad("lowpass", 140, 1.4);
  const airHpL = new Biquad("bandpass", 1180, 1.8);
  const airHpR = new Biquad("bandpass", 1240, 1.8);
  const wav = renderStereoLoop(4.0, (t) => {
    const mod = 1 + 0.012 * Math.sin(TAU * 0.5 * t);
    const turbine =
      Math.sin(TAU * 68 * mod * t) * 0.30 +
      Math.sin(TAU * 136 * mod * t + 0.6) * 0.16 +
      Math.sin(TAU * 204 * mod * t + 1.2) * 0.09 +
      Math.sin(TAU * 340 * mod * t) * 0.045;
    const nL = rngL();
    const nR = rngR();
    const roarL = jetBpL.process(nL) * 0.42 + subLpL.process(nL) * 0.55 + airHpL.process(nL) * 0.12;
    const roarR = jetBpR.process(nR) * 0.42 + subLpR.process(nR) * 0.55 + airHpR.process(nR) * 0.12;
    const l = softClip((turbine + roarL) * 0.68, 1.35);
    const r = softClip((turbine * 0.98 + roarR) * 0.68, 1.35);
    return [l, r];
  });
  await writeFile(outDir + "engine-cruise-loop.wav", wav);
}

// 3. Engine Afterburner Loop (heavy cinematic plasma roar + supersonic crackle + harmonic charge)
{
  const rngL = createRng(505);
  const rngR = createRng(606);
  const subL = new Biquad("lowpass", 130, 1.8);
  const subR = new Biquad("lowpass", 135, 1.8);
  const midL = new Biquad("bandpass", 520, 0.75);
  const midR = new Biquad("bandpass", 560, 0.75);
  const crackL = new Biquad("bandpass", 2100, 1.4);
  const crackR = new Biquad("bandpass", 2300, 1.4);
  const wav = renderStereoLoop(4.0, (t) => {
    const pulse = 0.92 + 0.08 * Math.sin(TAU * 3.5 * t);
    const subTone =
      Math.sin(TAU * 52 * t) * 0.36 +
      Math.sin(TAU * 104 * t + 0.3) * 0.22 +
      Math.sin(TAU * 156 * t) * 0.12 +
      Math.sin(TAU * 416 * t) * 0.055;
    const nL = rngL();
    const nR = rngR();
    // Supersonic plasma shear modulation
    const flutter = 0.75 + 0.25 * Math.sin(TAU * 11 * t + Math.sin(TAU * 2.5 * t));
    const jetL = subL.process(nL) * 0.72 + midL.process(nL) * 0.56 * flutter + crackL.process(nL) * 0.22;
    const jetR = subR.process(nR) * 0.72 + midR.process(nR) * 0.56 * flutter + crackR.process(nR) * 0.22;
    const l = softClip((subTone * pulse + jetL) * 0.76, 1.65);
    const r = softClip((subTone * pulse + jetR) * 0.76, 1.65);
    return [l, r];
  });
  await writeFile(outDir + "engine-afterburner-loop.wav", wav);
}

// 4. Afterburner Ignition One-Shot (deep sub-bass boom + plasma intake surge + high ion bloom)
{
  const rngL = createRng(707);
  const rngR = createRng(808);
  const bpL = new Biquad("bandpass", 420, 1.2);
  const bpR = new Biquad("bandpass", 460, 1.2);
  let phaseSub = 0;
  let phaseIon = 0;
  const wav = renderStereoOneShot(1.35, (t, _i, dur) => {
    const attack = Math.min(1, t / 0.018);
    const subFreq = 128 * Math.exp(-t * 5.2) + 34;
    phaseSub += (TAU * subFreq) / SAMPLE_RATE;
    const subEnv = attack * Math.exp(-t * 2.8);
    const subBoom = Math.sin(phaseSub) * subEnv * 0.85;

    const ionFreq = 180 + 520 * (1 - Math.exp(-t * 3.8));
    phaseIon += (TAU * ionFreq) / SAMPLE_RATE;
    const ionEnv = Math.min(1, t / 0.09) * Math.exp(-Math.max(0, t - 0.16) * 2.9);
    const ionSurge = (Math.sin(phaseIon) * 0.5 + Math.sin(phaseIon * 1.5) * 0.28) * ionEnv * 0.26;

    const noiseFreq = 260 + 1800 * Math.exp(-Math.pow((t - 0.12) / 0.24, 2));
    bpL.set("bandpass", noiseFreq, 1.1);
    bpR.set("bandpass", noiseFreq * 1.07, 1.1);
    const whooshEnv = Math.min(1, t / 0.04) * Math.exp(-Math.max(0, t - 0.12) * 3.2);
    const tailFade = t > dur - 0.12 ? Math.max(0, (dur - t) / 0.12) : 1;
    const wL = bpL.process(rngL()) * whooshEnv * 0.72;
    const wR = bpR.process(rngR()) * whooshEnv * 0.72;
    return [
      softClip((subBoom + ionSurge + wL) * tailFade, 1.5),
      softClip((subBoom + ionSurge * 0.96 + wR) * tailFade, 1.5),
    ];
  });
  await writeFile(outDir + "afterburner-ignite.wav", wav);
}

// 5. Retro-Brake Ignite One-Shot (pneumatic valve burst + turbine reverse spool-down)
{
  const rngL = createRng(909);
  const rngR = createRng(1010);
  const hpL = new Biquad("bandpass", 1450, 1.3);
  const hpR = new Biquad("bandpass", 1580, 1.3);
  const lpL = new Biquad("lowpass", 240, 1.4);
  const lpR = new Biquad("lowpass", 240, 1.4);
  let phaseSpool = 0;
  const wav = renderStereoOneShot(0.75, (t, _i, dur) => {
    const valve = Math.min(1, t / 0.008) * Math.exp(-t * 14);
    const sweepFreq = 580 * Math.exp(-t * 3.8) + 92;
    phaseSpool += (TAU * sweepFreq) / SAMPLE_RATE;
    const spoolEnv = Math.min(1, t / 0.025) * Math.exp(-t * 3.2);
    const spool = (Math.sin(phaseSpool) * 0.55 + Math.sin(phaseSpool * 2) * 0.22) * spoolEnv * 0.34;

    const airFreq = 1900 * Math.exp(-t * 2.2) + 480;
    hpL.set("bandpass", airFreq, 1.25);
    hpR.set("bandpass", airFreq * 1.09, 1.25);
    const nL = rngL();
    const nR = rngR();
    const gasEnv = Math.min(1, t / 0.015) * Math.exp(-t * 3.6);
    const thump = (lpL.process(nL) + lpR.process(nR)) * 0.35 * valve;
    const fade = t > dur - 0.08 ? Math.max(0, (dur - t) / 0.08) : 1;
    return [
      softClip((spool + thump + hpL.process(nL) * gasEnv * 0.65) * fade, 1.3),
      softClip((spool + thump + hpR.process(nR) * gasEnv * 0.65) * fade, 1.3),
    ];
  });
  await writeFile(outDir + "retro-brake-ignite.wav", wav);
}

// 6. Retro-Brake Loop (smooth stereo cold-gas RCS flow + reverse turbine aerodynamic drag)
{
  const rngL = createRng(1111);
  const rngR = createRng(1212);
  const gasL = new Biquad("bandpass", 920, 0.95);
  const gasR = new Biquad("bandpass", 1040, 0.95);
  const bodyL = new Biquad("bandpass", 240, 1.5);
  const bodyR = new Biquad("bandpass", 265, 1.5);
  const wav = renderStereoLoop(3.0, (t) => {
    const swirlL = 0.82 + 0.18 * Math.sin(TAU * 2.0 * t);
    const swirlR = 0.82 + 0.18 * Math.cos(TAU * 2.0 * t);
    const nL = rngL();
    const nR = rngR();
    const cryoL = gasL.process(nL) * 0.36 * swirlL + bodyL.process(nL) * 0.42;
    const cryoR = gasR.process(nR) * 0.36 * swirlR + bodyR.process(nR) * 0.42;
    const turbineDrag =
      Math.sin(TAU * 112 * t) * 0.16 +
      Math.sin(TAU * 224 * t + 0.7) * 0.07;
    return [
      softClip((cryoL + turbineDrag) * 0.66, 1.25),
      softClip((cryoR + turbineDrag * 0.96) * 0.66, 1.25),
    ];
  });
  await writeFile(outDir + "retro-brake-loop.wav", wav);
}

// 7. Retro-Brake Release One-Shot (clean mechanical latch + short venting hiss)
{
  const rngL = createRng(1313);
  const rngR = createRng(1414);
  const bpL = new Biquad("bandpass", 1320, 1.8);
  const bpR = new Biquad("bandpass", 1420, 1.8);
  const wav = renderStereoOneShot(0.45, (t, _i, dur) => {
    const click = Math.sin(TAU * 240 * t) * Math.exp(-t * 36) * 0.35;
    const hissEnv = Math.min(1, t / 0.01) * Math.exp(-t * 9.5);
    const fade = t > dur - 0.05 ? Math.max(0, (dur - t) / 0.05) : 1;
    return [
      softClip((click + bpL.process(rngL()) * hissEnv * 0.45) * fade, 1.1),
      softClip((click + bpR.process(rngR()) * hissEnv * 0.45) * fade, 1.1),
    ];
  });
  await writeFile(outDir + "retro-brake-release.wav", wav);
}

// 8. Ship Hull Collision Impact One-Shot (metallic crunch + structural sub-thud)
{
  const rngL = createRng(1515);
  const rngR = createRng(1616);
  const metalL = new Biquad("bandpass", 620, 2.4);
  const metalR = new Biquad("bandpass", 710, 2.4);
  let phase = 0;
  const wav = renderStereoOneShot(0.65, (t, _i, dur) => {
    const f = 96 * Math.exp(-t * 7.5) + 28;
    phase += (TAU * f) / SAMPLE_RATE;
    const thud = Math.sin(phase) * Math.exp(-t * 5.8) * 0.78;
    const clang = (Math.sin(TAU * 218 * t) + 0.6 * Math.sin(TAU * 371 * t)) * Math.exp(-t * 9.5) * 0.25;
    const scrapeEnv = Math.min(1, t / 0.005) * Math.exp(-t * 7.0);
    const fade = t > dur - 0.06 ? Math.max(0, (dur - t) / 0.06) : 1;
    return [
      softClip((thud + clang + metalL.process(rngL()) * scrapeEnv * 0.6) * fade, 1.6),
      softClip((thud + clang + metalR.process(rngR()) * scrapeEnv * 0.6) * fade, 1.6),
    ];
  });
  await writeFile(outDir + "ship-impact.wav", wav);
}

console.log("Generated 8 high-fidelity 44.1kHz stereo ship propulsion audio assets.");
