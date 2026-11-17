export type Role = "kapitan" | "askar" | "dushman" | "shoh" | "asir" | "ovchi" | "ayol";
export type Surface = "sand" | "grass" | "snow" | "rock" | "wood";

const ROLE_VOICE: Record<Role, { pitch: number; rate: number }> = {
  kapitan: { pitch: 0.85, rate: 0.95 },
  askar: { pitch: 1.0, rate: 1.08 },
  dushman: { pitch: 0.65, rate: 1.0 },
  shoh: { pitch: 0.4, rate: 0.82 },
  asir: { pitch: 1.25, rate: 1.05 },
  ovchi: { pitch: 0.95, rate: 1.0 },
  ayol: { pitch: 1.45, rate: 1.0 },
};

export class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  noiseBuf: AudioBuffer | null = null;
  oceanGain: GainNode | null = null;
  windGain: GainNode | null = null;
  windFilter: BiquadFilterNode | null = null;
  voiceOn = true;
  sfxOn = true;
  private voice: SpeechSynthesisVoice | null = null;
  private lastSpeak = 0;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
    this.pickVoice();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  private startAmbient() {
    const c = this.ctx!;
    const mk = () => {
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      return s;
    };
    // ocean: low-passed noise with slow swell
    const o = mk();
    const of = c.createBiquadFilter();
    of.type = "lowpass";
    of.frequency.value = 520;
    this.oceanGain = c.createGain();
    this.oceanGain.gain.value = 0.0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = c.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(of.frequency);
    lfo.start();
    o.connect(of).connect(this.oceanGain).connect(this.master!);
    o.start();
    // wind
    const w = mk();
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.8;
    this.windGain = c.createGain();
    this.windGain.gain.value = 0;
    const l2 = c.createOscillator();
    l2.frequency.value = 0.07;
    const g2 = c.createGain();
    g2.gain.value = 300;
    l2.connect(g2).connect(this.windFilter.frequency);
    l2.start();
    w.connect(this.windFilter).connect(this.windGain).connect(this.master!);
    w.start();
  }

  setAmbience(ocean: number, wind: number) {
    if (!this.ctx || !this.oceanGain || !this.windGain) return;
    const t = this.ctx.currentTime;
    this.oceanGain.gain.setTargetAtTime(ocean * 0.5, t, 0.4);
    this.windGain.gain.setTargetAtTime(wind * 0.22, t, 0.4);
  }

  private noise(dur: number, f0: number, f1: number, gain: number, type: BiquadFilterType = "lowpass", pan = 0) {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master!);
    } else g.connect(this.master!);
    s.start(0, Math.random());
    s.stop(c.currentTime + dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = "sine") {
    if (!this.ctx || !this.sfxOn) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master!);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }

  shot(kind: string, vol = 1, pan = 0) {
    const v = Math.min(1, vol);
    if (v < 0.03) return;
    switch (kind) {
      case "pistol": this.noise(0.18, 3000, 500, 0.5 * v, "bandpass", pan); this.tone(190, 60, 0.12, 0.35 * v, "triangle"); break;
      case "shotgun": this.noise(0.38, 2200, 250, 0.95 * v, "lowpass", pan); this.tone(120, 38, 0.25, 0.5 * v); break;
      case "rifle": this.noise(0.32, 3200, 380, 0.75 * v, "lowpass", pan); this.tone(150, 50, 0.18, 0.4 * v, "triangle"); break;
      case "smg": this.noise(0.1, 3600, 900, 0.35 * v, "bandpass", pan); this.tone(220, 90, 0.06, 0.2 * v, "square"); break;
      case "sniper": this.noise(0.7, 4200, 200, 1.0 * v, "lowpass", pan); this.tone(100, 28, 0.5, 0.6 * v); break;
      case "cannon": this.noise(0.9, 1000, 70, 1.2 * v, "lowpass", pan); this.tone(75, 24, 0.7, 0.9 * v); break;
      default: this.noise(0.2, 2500, 500, 0.4 * v, "bandpass", pan);
    }
  }
  explosion(vol = 1) { this.noise(1.3, 900, 50, 1.4 * Math.min(1, vol), "lowpass"); this.tone(60, 20, 0.9, 1.0 * Math.min(1, vol)); }
  hit() { this.noise(0.08, 1500, 500, 0.3, "bandpass"); this.tone(320, 160, 0.06, 0.15, "square"); }
  hurt() { this.noise(0.15, 600, 200, 0.5, "lowpass"); this.tone(130, 60, 0.18, 0.4, "sawtooth"); }
  splash(vol = 0.5) { this.noise(0.45, 2000, 400, 0.5 * Math.min(1, vol), "highpass"); }
  reload() { this.noise(0.05, 4000, 2000, 0.3, "highpass"); setTimeout(() => this.noise(0.06, 3000, 1500, 0.35, "highpass"), 380); setTimeout(() => this.tone(900, 700, 0.05, 0.15, "square"), 700); }
  pickup() { this.tone(660, 990, 0.12, 0.25, "sine"); setTimeout(() => this.tone(990, 1320, 0.16, 0.22, "sine"), 90); }
  success() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.35, 0.25, "triangle"), i * 140)); }
  step(s: Surface, vol = 1) {
    switch (s) {
      case "sand": this.noise(0.12, 900, 300, 0.1 * vol, "lowpass"); break;
      case "grass": this.noise(0.09, 1500, 500, 0.09 * vol, "bandpass"); break;
      case "snow": this.noise(0.14, 4000, 1800, 0.12 * vol, "highpass"); break;
      case "rock": this.noise(0.06, 1200, 400, 0.14 * vol, "bandpass"); this.tone(160, 90, 0.05, 0.08 * vol); break;
      case "wood": this.tone(130, 80, 0.07, 0.2 * vol, "triangle"); this.noise(0.05, 900, 300, 0.1 * vol); break;
    }
  }
  hoof(vol = 1) { this.tone(110, 70, 0.06, 0.2 * vol, "triangle"); this.noise(0.05, 700, 300, 0.12 * vol); }
  creak(vol = 1) { this.tone(240 + Math.random() * 80, 180, 0.4, 0.04 * vol, "sawtooth"); }

  private pickVoice() {
    if (typeof speechSynthesis === "undefined") return;
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return;
    this.voice =
      vs.find((v) => v.lang.toLowerCase().startsWith("uz")) ||
      vs.find((v) => v.lang.toLowerCase().startsWith("tr")) ||
      vs.find((v) => v.lang.toLowerCase().startsWith("kk")) ||
      vs.find((v) => v.lang.toLowerCase().startsWith("az")) ||
      vs.find((v) => v.lang.toLowerCase().startsWith("ru")) ||
      null;
  }

  /** speak a line in Uzbek (uz-UZ). Falls back to the closest installed voice. */
  speak(text: string, role: Role, force = false) {
    if (!this.voiceOn || typeof speechSynthesis === "undefined") return;
    const now = performance.now();
    if (!force && speechSynthesis.speaking && now - this.lastSpeak < 4500) return;
    if (force) speechSynthesis.cancel();
    this.lastSpeak = now;
    const u = new SpeechSynthesisUtterance(text);
    const rv = ROLE_VOICE[role];
    u.lang = "uz-UZ";
    if (this.voice) {
      u.voice = this.voice;
      if (!this.voice.lang.toLowerCase().startsWith("uz")) u.lang = this.voice.lang;
    }
    u.pitch = rv.pitch;
    u.rate = rv.rate;
    u.volume = 1;
    speechSynthesis.speak(u);
  }
}

export const LINES = {
  start: ["Kapitan, kema tayyor! Gorizont bizni kutmoqda.", "Xush kelibsiz, kapitan. O'n oltita orol — hammasini egallaymiz!"],
  board: ["Langarni ko'taringlar! Yo'lga chiqdik!", "Shamol bizga yor, kapitan!"],
  land: ["Quruqlikka tushdik! Hushyor bo'linglar!", "Orolga yetib keldik, kapitan."],
  enemy: ["Dushman ko'rindi! Otinglar!", "Qaroqchilar! Tayyor bo'linglar!", "Ular bu yerda, kapitan!"],
  enemyTalk: ["Bu yer bizniki, ket bu yerdan!", "Seni dengizga uloqtiramiz!", "Tutinglar uni!", "Bitta o'zing kelding, ahmoq!"],
  kill: ["Yaxshi o'q, kapitan!", "Bittasi kam!", "Zo'r otding!"],
  hurt: ["Ahh! Yaradorman!", "Ehtiyot bo'ling kapitan, jarohat oldingiz!"],
  lowhp: ["Kapitan, sog'ligingiz juda past! Chekining!"],
  captured: ["Orol bizniki! G'alaba, kapitan!", "Bayroqni ko'tardik! Orol egallandi!"],
  hire: ["Men xizmatga tayyorman, kapitan!", "Yangi askar qo'shiningizga qo'shildi!"],
  rescue: ["Rahmat, kapitan! Sizga umrbod qarzdorman!", "Ozod bo'ldim! Men ham siz bilan boraman!"],
  boss: ["Sen meni mag'lub qila olmaysan, dengiz iti!", "Mening orolimga kirding — endi qaytmaysan!"],
  sinkShip: ["Dushman kemasi cho'kmoqda! Hurra!"],
  night: ["Qosh qorayib qoldi, ehtiyot bo'ling."],
  snow: ["Qanday sovuq! Nafasimiz bug' bo'lib chiqyapti."],
  horse: ["Otga minamiz! Yur, chopamiz!"],
  reload: ["Qayta o'qlayman!"],
  noAmmo: ["O'q tugadi!"],
};
