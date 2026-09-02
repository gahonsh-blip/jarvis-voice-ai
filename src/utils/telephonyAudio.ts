/**
 * HERMES JARVIS — Telephony Acoustic Audio Synthesizer
 * Built using Web Audio API for DTMF keypad tones, realistic cellular/PSTN ringback tones,
 * incoming call chimes, and interactive on-hold acoustic harmony.
 */

class TelephonyAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private ringbackOsc1: OscillatorNode | null = null;
  private ringbackOsc2: OscillatorNode | null = null;
  private ringbackGain: GainNode | null = null;
  private ringbackTimer: any = null;

  private incomingOsc1: OscillatorNode | null = null;
  private incomingOsc2: OscillatorNode | null = null;
  private incomingGain: GainNode | null = null;
  private incomingTimer: any = null;

  private holdInterval: any = null;
  private isHolding = false;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Plays a genuine Dual-Tone Multi-Frequency (DTMF) touch tone
   */
  public playDtmf(key: string, durationMs = 160) {
    const ctx = this.getContext();
    if (!ctx) return;

    const dtmfMap: Record<string, [number, number]> = {
      '1': [697, 1209],
      '2': [697, 1336],
      '3': [697, 1477],
      '4': [770, 1209],
      '5': [770, 1336],
      '6': [770, 1477],
      '7': [852, 1209],
      '8': [852, 1336],
      '9': [852, 1477],
      '*': [941, 1209],
      '0': [941, 1336],
      '#': [941, 1477],
    };

    const freqs = dtmfMap[key];
    if (!freqs) return;

    const [rowFreq, colFreq] = freqs;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(rowFreq, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(colFreq, now);

    gainNode.gain.setValueAtTime(0.12, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);
  }

  /**
   * Starts playing a realistic 440Hz + 480Hz telephone ringback cadence (outbound ringing)
   */
  public startRingback() {
    this.stopRingback();
    const ctx = this.getContext();
    if (!ctx) return;

    const cycle = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.08, now);
      // Ring for 1.8 seconds, then fade out
      gain.gain.setValueAtTime(0.08, now + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.95);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.0);
      osc2.stop(now + 2.0);

      this.ringbackOsc1 = osc1;
      this.ringbackOsc2 = osc2;
      this.ringbackGain = gain;
    };

    cycle();
    this.ringbackTimer = setInterval(cycle, 4000);
  }

  public stopRingback() {
    if (this.ringbackTimer) {
      clearInterval(this.ringbackTimer);
      this.ringbackTimer = null;
    }
    if (this.ringbackGain && this.ctx) {
      try {
        this.ringbackGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
    try {
      this.ringbackOsc1?.stop();
      this.ringbackOsc2?.stop();
    } catch {}
    this.ringbackOsc1 = null;
    this.ringbackOsc2 = null;
    this.ringbackGain = null;
  }

  /**
   * Starts playing an authentic JARVIS incoming call ring alert
   */
  public startIncomingRingtone() {
    this.stopIncomingRingtone();
    const ctx = this.getContext();
    if (!ctx) return;

    const cycle = () => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Pulse 1: 523.25 Hz (C5) + 659.25 Hz (E5)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.35); // A5

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.35);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.5);
      osc2.stop(now + 0.5);

      // Pulse 2: 0.6s later
      setTimeout(() => {
        if (!this.ctx) return;
        const now2 = this.ctx.currentTime;
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        o1.type = 'triangle';
        o1.frequency.setValueAtTime(880, now2);
        o1.frequency.exponentialRampToValueAtTime(1174.66, now2 + 0.35);

        o2.type = 'sine';
        o2.frequency.setValueAtTime(659.25, now2);
        o2.frequency.exponentialRampToValueAtTime(880, now2 + 0.35);

        g.gain.setValueAtTime(0.12, now2);
        g.gain.exponentialRampToValueAtTime(0.001, now2 + 0.45);

        o1.connect(g);
        o2.connect(g);
        g.connect(this.ctx.destination);

        o1.start(now2);
        o2.start(now2);
        o1.stop(now2 + 0.5);
        o2.stop(now2 + 0.5);
      }, 550);
    };

    cycle();
    this.incomingTimer = setInterval(cycle, 3200);
  }

  public stopIncomingRingtone() {
    if (this.incomingTimer) {
      clearInterval(this.incomingTimer);
      this.incomingTimer = null;
    }
    try {
      this.incomingOsc1?.stop();
      this.incomingOsc2?.stop();
    } catch {}
    this.incomingOsc1 = null;
    this.incomingOsc2 = null;
    this.incomingGain = null;
  }

  /**
   * Sound effect when call connects
   */
  public playConnectChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.08); // A5
    osc.frequency.setValueAtTime(1174.66, now + 0.16); // D6

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  /**
   * Sound effect when call ends or is declined
   */
  public playDisconnectChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Dual descending tones
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Synthesized relaxing chord arpeggio for Hold Music
   */
  public startHoldMusic() {
    this.stopHoldMusic();
    this.isHolding = true;
    const ctx = this.getContext();
    if (!ctx) return;

    const chords = [
      [349.23, 440.0, 523.25, 659.25], // Fmaj7
      [392.0, 523.25, 587.33, 783.99],  // Gsus4
      [261.63, 329.63, 392.0, 493.88], // Cmaj7
      [220.0, 261.63, 329.63, 392.0],  // Am7
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (!this.isHolding || !this.ctx) return;
      const notes = chords[chordIdx % chords.length];
      chordIdx++;

      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime + idx * 0.35;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 1.3);
      });
    };

    playChord();
    this.holdInterval = setInterval(playChord, 2400);
  }

  public stopHoldMusic() {
    this.isHolding = false;
    if (this.holdInterval) {
      clearInterval(this.holdInterval);
      this.holdInterval = null;
    }
  }

  private dialOsc1: OscillatorNode | null = null;
  private dialOsc2: OscillatorNode | null = null;
  private dialGain: GainNode | null = null;
  private bandpassFilterNode: BiquadFilterNode | null = null;

  public init() {
    this.getContext();
  }

  public enableTelephoneBandpass(enabled: boolean) {
    const ctx = this.getContext();
    if (!ctx) return;
    if (enabled && !this.bandpassFilterNode) {
      this.bandpassFilterNode = ctx.createBiquadFilter();
      this.bandpassFilterNode.type = 'bandpass';
      this.bandpassFilterNode.frequency.setValueAtTime(1500, ctx.currentTime);
      this.bandpassFilterNode.Q.setValueAtTime(1.2, ctx.currentTime);
    }
  }

  /**
   * Starts playing a 350Hz + 440Hz standard telephone dial tone
   */
  public startDialTone() {
    this.stopDialTone();
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(350, now);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now);

    gain.gain.setValueAtTime(0.06, now);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);

    this.dialOsc1 = osc1;
    this.dialOsc2 = osc2;
    this.dialGain = gain;
  }

  public stopDialTone() {
    if (this.dialGain && this.ctx) {
      try {
        this.dialGain.gain.setValueAtTime(0, this.ctx.currentTime);
      } catch {}
    }
    try {
      this.dialOsc1?.stop();
      this.dialOsc2?.stop();
    } catch {}
    this.dialOsc1 = null;
    this.dialOsc2 = null;
    this.dialGain = null;
  }

  /**
   * Alias for startIncomingRingtone
   */
  public startRinging() {
    this.startIncomingRingtone();
  }

  /**
   * Alias for playDisconnectChime
   */
  public playDisconnectTone() {
    this.playDisconnectChime();
  }

  /**
   * Fast busy tone (rejection or line unavailable)
   */
  public playBusyTone() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const pulseStart = now + i * 0.5;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(480, pulseStart);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(620, pulseStart);

      gain.gain.setValueAtTime(0.08, pulseStart);
      gain.gain.setValueAtTime(0, pulseStart + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(pulseStart);
      osc2.start(pulseStart);
      osc1.stop(pulseStart + 0.26);
      osc2.stop(pulseStart + 0.26);
    }
  }

  /**
   * Clean up all active audio nodes
   */
  public stopAll() {
    this.stopDialTone();
    this.stopRingback();
    this.stopIncomingRingtone();
    this.stopHoldMusic();
  }
}

export const telephonyAudio = new TelephonyAudioSynthesizer();
