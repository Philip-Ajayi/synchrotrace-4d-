/**
 * SynchroTrace-4D Industrial Audio Alert Engine.
 * Synthesizes workstation confirmation chimes and high-priority interlock klaxons
 * via Web Audio API without requiring external audio assets.
 */

class StationAudioManager {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
  }

  _initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSuccessChime() {
    if (this.isMuted) return;
    this._initContext();

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sine';
    // Pleasant two-tone ascending confirmation (523Hz -> 659Hz)
    const now = this.audioCtx.currentTime;
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  playInterlockAlarm() {
    if (this.isMuted) return;
    this._initContext();

    // Urgent dual-tone harsh industrial klaxon (880Hz / 440Hz sawtooth)
    const now = this.audioCtx.currentTime;

    for (let i = 0; i < 3; i++) {
      const startTime = now + (i * 0.16);
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, startTime);
      osc.frequency.setValueAtTime(440, startTime + 0.08);

      gain.gain.setValueAtTime(0.28, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.16);
    }
  }
}

window.audioManager = new StationAudioManager();
