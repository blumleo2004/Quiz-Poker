export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
    }

    playTone(freq, type, duration, vol = 0.1) {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playJoin() { this.playTone(440, 'sine', 0.3); setTimeout(() => this.playTone(554, 'sine', 0.3), 100); }
    playStart() {
        this.playTone(440, 'square', 0.1);
        setTimeout(() => this.playTone(554, 'square', 0.1), 100);
        setTimeout(() => this.playTone(659, 'square', 0.4), 200);
    }
    playChip() { this.playTone(800, 'triangle', 0.1, 0.05); }
    playFold() { this.playTone(150, 'sawtooth', 0.3); }
    playWin() {
        [0, 100, 200, 300].forEach((t, i) => setTimeout(() => this.playTone(500 + (i * 100), 'sine', 0.2), t));
    }
    playError() { this.playTone(150, 'sawtooth', 0.4); }
    playTurn() { this.playTone(600, 'sine', 0.2); setTimeout(() => this.playTone(800, 'sine', 0.2), 100); }
}
