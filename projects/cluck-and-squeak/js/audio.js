/**
 * Procedural Web Audio Sound Synthesizer for Cluck & Squeak Battle Simulator
 * Zero external audio files needed! All sound effects synthesized in real time.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
    this.lastSoundTimes = new Map();
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.35 : 0, this.ctx.currentTime);
    }
    return this.enabled;
  }

  // Rate limit sounds so 100 units don't blow out speakers
  canPlay(key, minIntervalMs = 40) {
    if (!this.enabled || !this.ctx) return false;
    const now = performance.now();
    const last = this.lastSoundTimes.get(key) || 0;
    if (now - last < minIntervalMs) return false;
    this.lastSoundTimes.set(key, now);
    return true;
  }

  /**
   * Chicken Cluck: Short organic wobble
   */
  playCluck(pitchMod = 1.0) {
    if (!this.canPlay('cluck', 50)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    const baseFreq = (380 + Math.random() * 80) * pitchMod;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 0.12);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.Q.setValueAtTime(2.0, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /**
   * Rooster Battle Crow: Epic "Cock-a-doodle-doo!"
   */
  playRoosterCrow() {
    if (!this.canPlay('rooster_crow', 600)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const notes = [
      { f: 440, dur: 0.12, del: 0 },
      { f: 554, dur: 0.14, del: 0.14 },
      { f: 659, dur: 0.18, del: 0.30 },
      { f: 880, dur: 0.45, del: 0.50 }
    ];

    notes.forEach(({ f, dur, del }) => {
      const startT = now + del;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, startT);
      osc.frequency.linearRampToValueAtTime(f * 1.05, startT + dur);

      // Vibrato
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(8, startT);
      lfoGain.gain.setValueAtTime(15, startT);
      lfo.connect(osc.frequency);
      lfo.start(startT);
      lfo.stop(startT + dur);

      gain.gain.setValueAtTime(0, startT);
      gain.gain.linearRampToValueAtTime(0.18, startT + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startT);
      osc.stop(startT + dur);
    });
  }

  /**
   * Mouse Squeak: High frequency squeak chirp
   */
  playMouseSqueak(pitchMod = 1.0) {
    if (!this.canPlay('squeak', 50)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = (2200 + Math.random() * 600) * pitchMod;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.3, now + 0.03);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.8, now + 0.1);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Cavalry War Horn / Bugle Charge Fanfare
   */
  playChargeHorn(isChicken = true) {
    if (!this.canPlay('charge_horn', 800)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const notes = isChicken 
      ? [330, 440, 554, 660] // A major fanfare
      : [293, 370, 440, 587]; // D major fanfare

    notes.forEach((freq, idx) => {
      const startT = now + idx * 0.09;
      const dur = idx === notes.length - 1 ? 0.35 : 0.08;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startT);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, startT);

      gain.gain.setValueAtTime(0, startT);
      gain.gain.linearRampToValueAtTime(0.22, startT + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startT + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startT);
      osc.stop(startT + dur);
    });
  }

  /**
   * Heavy Cavalry Impact / Trample Crash
   */
  playImpactThud(intensity = 1.0) {
    if (!this.canPlay('impact', 35)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    // Sub bass drop
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);

    gain.gain.setValueAtTime(0.35 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.23);

    // Punchy noise snap
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25 * intensity, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    noise.start(now);
  }

  /**
   * Toothpick / Spear Clash
   */
  playClash() {
    if (!this.canPlay('clash', 35)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Egg Catapult Launch Whoosh
   */
  playEggLaunch() {
    if (!this.canPlay('launch', 60)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 0.15);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  /**
   * Egg Splat: Liquid yolk burst
   */
  playEggSplat() {
    if (!this.canPlay('splat', 50)) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  /**
   * Victory Fanfare
   */
  playVictory(isChickenWon) {
    this.ensureContext();
    const now = this.ctx.currentTime;
    const root = isChickenWon ? 523.25 : 587.33; // C5 or D5
    const chords = [
      { f: root, t: 0 },
      { f: root * 1.25, t: 0.15 },
      { f: root * 1.5, t: 0.3 },
      { f: root * 2.0, t: 0.5 }
    ];

    chords.forEach(({ f, t }) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.2, now + t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.6);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + t);
      osc.stop(now + t + 0.65);
    });
  }
}

export const audio = new SoundEngine();
