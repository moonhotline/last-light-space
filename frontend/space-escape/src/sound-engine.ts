/**
 * Last Light · Cosmic Audio & Sound Engine
 * Procedural Web Audio & Tone generative sound system.
 * Implements high-fidelity spaceship propulsion acoustics, warp gate spatial resonance,
 * atmospheric-to-deep-space transition drones, and modern sci-fi UI acoustic feedback.
 */

export class CosmicAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Ship Thruster Audio Nodes
  private thrusterGain: GainNode | null = null;
  private thrusterFilter: BiquadFilterNode | null = null;
  private thrusterOsc1: OscillatorNode | null = null;
  private thrusterOsc2: OscillatorNode | null = null;
  private thrusterNoiseSource: AudioBufferSourceNode | null = null;
  private thrusterNoiseGain: GainNode | null = null;
  private thrusterNoiseFilter: BiquadFilterNode | null = null;

  // Retro Brake / RCS Nodes
  private brakeGain: GainNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;

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
  private currentVolume = 0.75;
  private lastThrottle = 0;

  constructor() {}

  /**
   * Initialize Web Audio context upon first user gesture.
   */
  async init(existingContext?: AudioContext, destinationNode?: AudioNode) {
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
      this.ctx = existingContext || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
      const dest = destinationNode || this.ctx.destination;
      this.masterGain.connect(dest);

      this.setupShipThruster();
      this.setupPortalResonance();
      this.setupGenerativeCosmicMusic();

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
    this.thrusterGain?.gain.setTargetAtTime(0, now, 0.08);
    this.brakeGain?.gain.setTargetAtTime(0, now, 0.08);
    this.portalGain?.gain.setTargetAtTime(0, now, 0.08);
  }

  /**
   * Ship propulsion sound generator:
   * Combines sub-audible low rumble, turbine whine, and turbulent plasma exhaust.
   */
  private setupShipThruster() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Thruster master gain
    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.setValueAtTime(0, now);

    // Resonant lowpass filter
    this.thrusterFilter = this.ctx.createBiquadFilter();
    this.thrusterFilter.type = "lowpass";
    this.thrusterFilter.frequency.setValueAtTime(280, now);
    this.thrusterFilter.Q.setValueAtTime(2.2, now);

    // Dual detuned low-frequency sawtooth oscillators for the turbine core
    this.thrusterOsc1 = this.ctx.createOscillator();
    this.thrusterOsc1.type = "sawtooth";
    this.thrusterOsc1.frequency.setValueAtTime(46, now);

    this.thrusterOsc2 = this.ctx.createOscillator();
    this.thrusterOsc2.type = "triangle";
    this.thrusterOsc2.frequency.setValueAtTime(47.5, now);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.35, now);
    this.thrusterOsc1.connect(oscGain);
    this.thrusterOsc2.connect(oscGain);
    oscGain.connect(this.thrusterFilter);

    // Filtered pink/white noise for plasma exhaust jet
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink noise approximation
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      output[i] = (b0 + b1 + b2) * 0.28;
    }

    this.thrusterNoiseSource = this.ctx.createBufferSource();
    this.thrusterNoiseSource.buffer = noiseBuffer;
    this.thrusterNoiseSource.loop = true;

    this.thrusterNoiseFilter = this.ctx.createBiquadFilter();
    this.thrusterNoiseFilter.type = "bandpass";
    this.thrusterNoiseFilter.frequency.setValueAtTime(420, now);
    this.thrusterNoiseFilter.Q.setValueAtTime(1.8, now);

    this.thrusterNoiseGain = this.ctx.createGain();
    this.thrusterNoiseGain.gain.setValueAtTime(0.2, now);

    this.thrusterNoiseSource.connect(this.thrusterNoiseFilter);
    this.thrusterNoiseFilter.connect(this.thrusterNoiseGain);
    this.thrusterNoiseGain.connect(this.thrusterFilter);

    this.thrusterFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.masterGain);

    this.thrusterOsc1.start(now);
    this.thrusterOsc2.start(now);
    this.thrusterNoiseSource.start(now);

    // Setup retro-brake thrusters (X key)
    this.brakeGain = this.ctx.createGain();
    this.brakeGain.gain.setValueAtTime(0, now);
    this.brakeFilter = this.ctx.createBiquadFilter();
    this.brakeFilter.type = "bandpass";
    this.brakeFilter.frequency.setValueAtTime(800, now);
    this.brakeFilter.Q.setValueAtTime(3.5, now);

    this.thrusterNoiseSource.connect(this.brakeFilter);
    this.brakeFilter.connect(this.brakeGain);
    this.brakeGain.connect(this.masterGain);
  }

  /**
   * Warp Gate ethereal harmonic resonance:
   * Ambient Pythagorean chord (220, 330, 440, 660 Hz) that hums near warp gates.
   */
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

  /**
   * Generative Ambient Cosmic Music:
   * Multi-track space ambient with slow pad swells and celestial arpeggios.
   */
  private setupGenerativeCosmicMusic() {
    if (!this.ctx || !this.masterGain) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    this.musicGain.connect(this.masterGain);
    this.startAmbientProgression();
  }

  private startAmbientProgression() {
    if (this.musicActive) return;
    this.musicActive = true;

    // Space chords: [C minor 9, Eb major 7, Ab major 7, Bb sus4]
    const chords = [
      [130.81, 155.56, 196.00, 293.66], // Cm9
      [155.56, 196.00, 233.08, 293.66], // Ebmaj7
      [103.83, 155.56, 207.65, 311.13], // Abmaj7
      [116.54, 174.61, 233.08, 349.23], // Bbsus4
    ];

    const playNextChord = () => {
      if (!this.ctx || !this.musicActive) return;
      const now = this.ctx.currentTime;
      const chord = chords[this.chordIndex % chords.length];
      this.chordIndex++;

      // Play pad notes with slow envelope
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
        noteGain.gain.linearRampToValueAtTime(0.045, now + 2.5);
        noteGain.gain.linearRampToValueAtTime(0.03, now + 5);
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

      // Scatter celestial arpeggiator high bells
      const bells = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50];
      for (let i = 0; i < 3; i++) {
        const bellTime = now + 1.2 + i * 2.1 + Math.random() * 0.8;
        const bellFreq = bells[Math.floor(Math.random() * bells.length)];
        const bellOsc = this.ctx.createOscillator();
        const bellGain = this.ctx.createGain();
        bellOsc.type = "sine";
        bellOsc.frequency.setValueAtTime(bellFreq, bellTime);

        bellGain.gain.setValueAtTime(0, bellTime);
        bellGain.gain.linearRampToValueAtTime(0.02, bellTime + 0.04);
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
   * Update real-time spaceship thruster sound parameters.
   * Modulates turbine frequency, plasma noise bandwidth, and afterburner roar.
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
  }) {
    if (!this.ctx || !this.thrusterGain || !this.thrusterFilter || !this.thrusterOsc1) return;
    const now = this.ctx.currentTime;
    const { speed, grounded, boosting, braking, climbing, repaired } = params;

    if (!repaired) {
      this.thrusterGain.gain.setTargetAtTime(0, now, 0.1);
      this.brakeGain?.gain.setTargetAtTime(0, now, 0.1);
      return;
    }

    // Target throttle: idle (0.15), cruise (0.5), boost (1.0)
    let throttle = grounded ? (climbing ? 0.4 : 0.05) : 0.35 + Math.min(speed / 90, 0.45);
    if (boosting) throttle = 1.0;
    if (braking) throttle = Math.max(0.12, throttle * 0.4);

    this.lastThrottle = throttle;

    // Volume target
    const targetGain = grounded && !climbing ? 0.04 : 0.12 + throttle * 0.38;
    this.thrusterGain.gain.setTargetAtTime(targetGain, now, 0.08);

    // Turbine pitch scaling: 44Hz idle -> 76Hz cruise -> 118Hz afterburner
    const targetPitch = 44 + throttle * 52 + (boosting ? 28 : 0);
    this.thrusterOsc1.frequency.setTargetAtTime(targetPitch, now, 0.12);
    if (this.thrusterOsc2) {
      this.thrusterOsc2.frequency.setTargetAtTime(targetPitch * 1.025, now, 0.12);
    }

    // Resonant filter frequency: opens up as throttle rises
    const filterFreq = 220 + throttle * 1250 + (boosting ? 1100 : 0);
    this.thrusterFilter.frequency.setTargetAtTime(filterFreq, now, 0.09);

    // Plasma noise filter & gain
    if (this.thrusterNoiseFilter && this.thrusterNoiseGain) {
      const noiseFreq = 380 + throttle * 850 + (boosting ? 900 : 0);
      this.thrusterNoiseFilter.frequency.setTargetAtTime(noiseFreq, now, 0.1);
      this.thrusterNoiseGain.gain.setTargetAtTime(0.1 + throttle * 0.35, now, 0.08);
    }

    // Retro-brake hiss when braking (X)
    if (this.brakeGain && this.brakeFilter) {
      const brakeTargetGain = braking ? 0.32 : 0;
      this.brakeGain.gain.setTargetAtTime(brakeTargetGain, now, 0.05);
      if (braking) {
        this.brakeFilter.frequency.setTargetAtTime(650 + Math.random() * 200, now, 0.05);
      }
    }
  }

  /**
   * Update spatial audio for nearest Warp Gate.
   */
  updatePortalProximity(distToNearestGate: number) {
    if (!this.ctx || !this.portalGain) return;
    const now = this.ctx.currentTime;
    // Audible within 2800m
    const maxDist = 2800;
    if (distToNearestGate > maxDist) {
      this.portalGain.gain.setTargetAtTime(0, now, 0.2);
    } else {
      const norm = 1.0 - Math.min(distToNearestGate / maxDist, 1.0);
      const gain = Math.pow(norm, 1.6) * 0.24;
      this.portalGain.gain.setTargetAtTime(gain, now, 0.15);
    }
  }

  /**
   * Sci-fi UI Acoustic Feedback
   */
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
    if (this.musicTimer) clearTimeout(this.musicTimer);
    this.musicActive = false;
    try {
      this.ctx?.close();
    } catch {}
  }
}

export const cosmicAudio = new CosmicAudioEngine();
