/**
 * Last Light - Cosmic Audio & Ship Propulsion Acoustic Engine
 * Four-layer sample + Web Audio modulated propulsion sound system:
 * 1. Multi-layer seamless loops (idle / cruise / afterburner) with throttle crossfade & atmospheric/vacuum filtering
 * 2. Edge-triggered afterburner ignition sub-bass punch one-shot
 * 3. Pneumatic cold-gas retro-brake ignite, stereo loop with speed pitch down-sweep, and valve release
 * 4. Physical collision impact & warp-gate spatial harmonic resonance
 */

type LoopLayerKey = "idle" | "cruise" | "afterburner" | "brake";
type OneShotKey = "afterburnerIgnite" | "retroIgnite" | "retroRelease" | "shipImpact";

const AUDIO_URLS: Record<LoopLayerKey | OneShotKey, string> = {
  idle: "/assets/audio/engine-idle-loop.wav",
  cruise: "/assets/audio/engine-cruise-loop.wav",
  afterburner: "/assets/audio/engine-afterburner-loop.wav",
  brake: "/assets/audio/retro-brake-loop.wav",
  afterburnerIgnite: "/assets/audio/afterburner-ignite.wav",
  retroIgnite: "/assets/audio/retro-brake-ignite.wav",
  retroRelease: "/assets/audio/retro-brake-release.wav",
  shipImpact: "/assets/audio/ship-impact.wav",
};

interface LoopNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class CosmicAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private propulsionBus: GainNode | null = null;
  private propulsionFilter: BiquadFilterNode | null = null;

  // Sample-based 4-layer ship propulsion loops & one-shot buffers
  private buffers = new Map<string, AudioBuffer>();
  private loopNodes = new Map<LoopLayerKey, LoopNode>();
  private loadingSamples = false;
  private samplesReady = false;

  // Edge detection & cooldown states for one-shots
  private wasBoosting = false;
  private wasBraking = false;
  private wasGrounded = true;
  private lastBoostIgniteAt = -10;
  private lastBrakeIgniteAt = -10;
  private lastImpactAt = -10;

  // Warp Gate Resonance
  private portalGain: GainNode | null = null;
  private portalOscs: OscillatorNode[] = [];

  // Cosmic Generative Music
  private musicGain: GainNode | null = null;
  private musicActive = false;
  private musicTimer: number | null = null;
  private chordIndex = 0;

  // State
  private initialized = false;
  private ownsContext = false;
  private disposed = false;
  private currentVolume = 0.75;

  async init(existingContext?: AudioContext, destinationNode?: AudioNode) {
    this.disposed = false;
    if (this.initialized && this.ctx?.state === "running") {
      if (destinationNode && this.masterGain) {
        try {
          this.masterGain.disconnect();
          this.masterGain.connect(destinationNode);
        } catch {}
      }
      return;
    }
    try {
      this.ownsContext = !existingContext;
      this.ctx =
        existingContext ||
        new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext)();
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
      const dest = destinationNode || this.ctx.destination;
      this.masterGain.connect(dest);

      this.setupPropulsionBus();
      this.setupPortalResonance();
      this.setupGenerativeCosmicMusic();
      void this.loadPropulsionSamples();

      this.initialized = true;
    } catch {
      // AudioContext unavailable or restricted
    }
  }

  setVolume(volume: number) {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.currentVolume, this.ctx.currentTime, 0.05);
  }

  pause() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.propulsionBus?.gain.setTargetAtTime(0, now, 0.08);
    for (const node of this.loopNodes.values()) {
      node.gain.gain.setTargetAtTime(0, now, 0.08);
    }
    this.portalGain?.gain.setTargetAtTime(0, now, 0.08);
    this.wasBoosting = false;
    this.wasBraking = false;
  }

  private setupPropulsionBus() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.propulsionFilter = this.ctx.createBiquadFilter();
    this.propulsionFilter.type = "lowpass";
    this.propulsionFilter.frequency.setValueAtTime(6400, now);
    this.propulsionFilter.Q.setValueAtTime(0.75, now);

    this.propulsionBus = this.ctx.createGain();
    this.propulsionBus.gain.setValueAtTime(0, now);

    this.propulsionFilter.connect(this.propulsionBus);
    this.propulsionBus.connect(this.masterGain);
  }

  private async loadPropulsionSamples() {
    if (!this.ctx || this.loadingSamples || this.samplesReady) return;
    this.loadingSamples = true;
    try {
      const entries = Object.entries(AUDIO_URLS) as [LoopLayerKey | OneShotKey, string][];
      await Promise.all(
        entries.map(async ([key, url]) => {
          try {
            const resp = await fetch(url);
            if (!resp.ok || this.disposed || !this.ctx) return;
            const arrayBuf = await resp.arrayBuffer();
            if (this.disposed || !this.ctx) return;
            const decoded = await this.ctx.decodeAudioData(arrayBuf);
            if (!this.disposed) this.buffers.set(key, decoded);
          } catch {
            // Skip unavailable sample in headless/offline environments
          }
        }),
      );
      if (!this.disposed && this.ctx) {
        this.startLoopLayers();
        this.samplesReady = this.loopNodes.size > 0;
      }
    } finally {
      this.loadingSamples = false;
    }
  }

  private startLoopLayers() {
    if (!this.ctx || !this.propulsionFilter) return;
    const now = this.ctx.currentTime;
    const loopConfigs: { key: LoopLayerKey; filterType: BiquadFilterType; freq: number; q: number }[] = [
      { key: "idle", filterType: "lowpass", freq: 620, q: 0.9 },
      { key: "cruise", filterType: "lowpass", freq: 2400, q: 0.85 },
      { key: "afterburner", filterType: "lowpass", freq: 5200, q: 1.0 },
      { key: "brake", filterType: "bandpass", freq: 980, q: 0.85 },
    ];
    for (const cfg of loopConfigs) {
      if (this.loopNodes.has(cfg.key)) continue;
      const buffer = this.buffers.get(cfg.key);
      if (!buffer) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = cfg.filterType;
      filter.frequency.setValueAtTime(cfg.freq, now);
      filter.Q.setValueAtTime(cfg.q, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.propulsionFilter);
      source.start(now);

      this.loopNodes.set(cfg.key, { source, gain, filter });
    }
  }

  private playOneShot(key: OneShotKey, volume = 0.65, playbackRate = 1.0) {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(playbackRate, now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.01, Math.min(1.2, volume)), now);
    src.connect(g);
    g.connect(this.masterGain);
    src.start(now);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  /** Trigger physical ship hull collision acoustic feedback. */
  playShipCollision(intensity = 0.7) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpactAt < 0.18) return;
    this.lastImpactAt = now;
    const clamped = Math.max(0.15, Math.min(1, intensity));
    this.playOneShot("shipImpact", 0.35 + clamped * 0.55, 0.85 + clamped * 0.3);
  }

  private setupPortalResonance() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    this.portalGain = this.ctx.createGain();
    this.portalGain.gain.setValueAtTime(0, now);

    const freqs = [220, 329.63, 440, 659.25];
    this.portalOscs = freqs.map((f, idx) => {
      const osc = this.ctx!.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f + (idx % 2 === 0 ? 0.35 : -0.35), now);
      const g = this.ctx!.createGain();
      g.gain.setValueAtTime(0.18 / (idx + 1), now);
      osc.connect(g);
      g.connect(this.portalGain!);
      osc.start(now);
      return osc;
    });

    this.portalGain.connect(this.masterGain);
  }

  private setupGenerativeCosmicMusic() {
    if (!this.ctx || !this.masterGain) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.24, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);
    this.startAmbientProgression();
  }

  private startAmbientProgression() {
    if (this.musicActive) return;
    this.musicActive = true;

    const chords = [
      [130.81, 155.56, 196.0, 293.66],
      [155.56, 196.0, 233.08, 293.66],
      [103.83, 155.56, 207.65, 311.13],
      [116.54, 174.61, 233.08, 349.23],
    ];

    const playNextChord = () => {
      if (!this.ctx || !this.musicActive) return;
      const now = this.ctx.currentTime;
      const chord = chords[this.chordIndex % chords.length];
      this.chordIndex++;

      chord.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const noteGain = this.ctx!.createGain();
        const filter = this.ctx!.createBiquadFilter();

        osc.type = idx === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, now);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(450, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 3);
        filter.frequency.exponentialRampToValueAtTime(350, now + 8);

        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(0.04, now + 2.5);
        noteGain.gain.linearRampToValueAtTime(0.025, now + 5);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 8.5);

        osc.connect(filter);
        filter.connect(noteGain);
        noteGain.connect(this.musicGain!);

        osc.start(now);
        osc.stop(now + 9);
        osc.onended = () => {
          osc.disconnect();
          filter.disconnect();
          noteGain.disconnect();
        };
      });

      const bells = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
      for (let i = 0; i < 3; i++) {
        const bellTime = now + 1.2 + i * 2.1 + Math.random() * 0.8;
        const bellFreq = bells[Math.floor(Math.random() * bells.length)];
        const bellOsc = this.ctx.createOscillator();
        const bellGain = this.ctx.createGain();
        bellOsc.type = "sine";
        bellOsc.frequency.setValueAtTime(bellFreq, bellTime);

        bellGain.gain.setValueAtTime(0, bellTime);
        bellGain.gain.linearRampToValueAtTime(0.018, bellTime + 0.04);
        bellGain.gain.exponentialRampToValueAtTime(0.0001, bellTime + 2.2);

        bellOsc.connect(bellGain);
        bellGain.connect(this.musicGain!);
        bellOsc.start(bellTime);
        bellOsc.stop(bellTime + 2.3);
        bellOsc.onended = () => {
          bellOsc.disconnect();
          bellGain.disconnect();
        };
      }

      this.musicTimer = window.setTimeout(playNextChord, 7500);
    };

    playNextChord();
  }

  /**
   * Update real-time 4-layer spaceship propulsion and retro-brake acoustics.
   */
  updateShipAudio(params: {
    speed: number;
    altitude: number;
    grounded: boolean;
    boosting: boolean;
    braking: boolean;
    climbing: boolean;
    repaired: boolean;
    inDeepSpace: boolean;
    piloting?: boolean;
    throttle?: number;
  }) {
    if (!this.ctx || !this.propulsionBus || !this.propulsionFilter) return;
    const now = this.ctx.currentTime;
    const { speed, grounded, boosting, braking, climbing, repaired, inDeepSpace, piloting = true } = params;

    if (!repaired || !piloting) {
      this.propulsionBus.gain.setTargetAtTime(0, now, 0.12);
      this.wasBoosting = false;
      this.wasBraking = false;
      return;
    }

    // Master propulsion bus active
    this.propulsionBus.gain.setTargetAtTime(0.9, now, 0.08);

    // Deep space attenuates atmospheric high-frequency air rush, preserving hull resonance
    const envCutoff = inDeepSpace ? (boosting ? 3200 : 1850) : (boosting ? 7600 : 4800);
    this.propulsionFilter.frequency.setTargetAtTime(envCutoff, now, 0.14);

    // Edge-triggered one-shots
    if (boosting && !this.wasBoosting && !braking && now - this.lastBoostIgniteAt > 0.55) {
      this.lastBoostIgniteAt = now;
      this.playOneShot("afterburnerIgnite", inDeepSpace ? 0.58 : 0.72, 0.96 + Math.min(speed / 600, 0.15));
    }
    if (braking && !this.wasBraking && now - this.lastBrakeIgniteAt > 0.35) {
      this.lastBrakeIgniteAt = now;
      this.playOneShot("retroIgnite", 0.52 + Math.min(speed / 350, 0.25), 0.9 + Math.min(speed / 450, 0.28));
    } else if (!braking && this.wasBraking) {
      this.playOneShot("retroRelease", 0.38, 1.0);
    }
    // Soft liftoff ignition cue when breaking ground contact
    if (!grounded && this.wasGrounded && climbing && now - this.lastBoostIgniteAt > 0.6) {
      this.playOneShot("afterburnerIgnite", 0.32, 0.78);
    }

    this.wasBoosting = boosting && !braking;
    this.wasBraking = braking;
    this.wasGrounded = grounded;

    // Normalized speed and throttle envelopes
    const speedNorm = Math.min(speed / 420, 1.0);
    const throttle = params.throttle !== undefined
      ? Math.max(0, Math.min(1.5, params.throttle))
      : grounded
        ? (climbing ? 0.55 : 0.12)
        : boosting
          ? 1.35
          : 0.38 + speedNorm * 0.62;

    // Layer 1: Idle fusion core hum (always present, fades down slightly under afterburner)
    const idleNode = this.loopNodes.get("idle");
    if (idleNode) {
      const idleVol = grounded && !climbing ? 0.26 : Math.max(0.14, 0.32 - throttle * 0.12);
      idleNode.gain.gain.setTargetAtTime(idleVol, now, 0.1);
      idleNode.source.playbackRate.setTargetAtTime(0.92 + throttle * 0.22, now, 0.14);
      idleNode.filter.frequency.setTargetAtTime(420 + throttle * 520, now, 0.12);
    }

    // Layer 2: Cruise turbine & ion flow
    const cruiseNode = this.loopNodes.get("cruise");
    if (cruiseNode) {
      let cruiseVol = grounded && !climbing ? 0.04 : 0.18 + Math.min(throttle, 1.0) * 0.38;
      if (braking) cruiseVol *= 0.45;
      cruiseNode.gain.gain.setTargetAtTime(cruiseVol, now, 0.09);
      const cruiseRate = 0.82 + speedNorm * 0.48 + (climbing ? 0.12 : 0) - (braking ? 0.14 : 0);
      cruiseNode.source.playbackRate.setTargetAtTime(Math.max(0.65, cruiseRate), now, 0.12);
      cruiseNode.filter.frequency.setTargetAtTime(1100 + speedNorm * 2400 + (boosting ? 1100 : 0), now, 0.1);
    }

    // Layer 3: Afterburner supersonic roar
    const abNode = this.loopNodes.get("afterburner");
    if (abNode) {
      const abVol = boosting && !braking ? 0.52 + speedNorm * 0.22 : (speedNorm > 0.65 && !braking ? (speedNorm - 0.65) * 0.45 : 0);
      abNode.gain.gain.setTargetAtTime(abVol, now, 0.08);
      abNode.source.playbackRate.setTargetAtTime(0.92 + speedNorm * 0.38, now, 0.12);
      abNode.filter.frequency.setTargetAtTime(inDeepSpace ? 2600 : 5400, now, 0.1);
    }

    // Layer 4: Retro-Brake stereo cold-gas & reverse turbine drag
    const brakeNode = this.loopNodes.get("brake");
    if (brakeNode) {
      const brakeVol = braking ? 0.34 + Math.min(speed / 240, 0.34) : 0;
      brakeNode.gain.gain.setTargetAtTime(brakeVol, now, 0.06);
      // Smooth pitch down-sweep as velocity drops instead of random noise jitter
      const brakeRate = 0.72 + Math.min(speed / 300, 0.55);
      brakeNode.source.playbackRate.setTargetAtTime(brakeRate, now, 0.09);
      brakeNode.filter.frequency.setTargetAtTime(620 + Math.min(speed * 2.4, 980), now, 0.08);
    }
  }

  updatePortalProximity(distToNearestGate: number) {
    if (!this.ctx || !this.portalGain) return;
    const now = this.ctx.currentTime;
    const maxDist = 2800;
    if (distToNearestGate > maxDist) {
      this.portalGain.gain.setTargetAtTime(0, now, 0.2);
    } else {
      const norm = 1.0 - Math.min(distToNearestGate / maxDist, 1.0);
      const gain = Math.pow(norm, 1.6) * 0.24;
      this.portalGain.gain.setTargetAtTime(gain, now, 0.15);
    }
  }

  playUIClick() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.015);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  playUIHover() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now);
    g.gain.setValueAtTime(0.025, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.015);
  }

  playUISelect() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    [660, 1320].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);
      g.gain.setValueAtTime(0.05, now + idx * 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.02 + 0.06);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + idx * 0.02);
      osc.stop(now + idx * 0.02 + 0.07);
    });
  }

  dispose() {
    this.disposed = true;
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicTimer = null;
    this.musicActive = false;
    for (const node of this.loopNodes.values()) {
      try {
        node.source.stop();
        node.source.disconnect();
      } catch {}
    }
    this.loopNodes.clear();
    if (this.ownsContext) {
      try {
        this.ctx?.close();
      } catch {}
    }
    this.ctx = null;
    this.masterGain = null;
    this.propulsionBus = null;
    this.propulsionFilter = null;
    this.portalGain = null;
    this.musicGain = null;
    this.initialized = false;
    this.samplesReady = false;
  }
}

export const cosmicAudio = new CosmicAudioEngine();
