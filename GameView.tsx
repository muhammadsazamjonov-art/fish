"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/engine";
import { BIOMES, ISLANDS, ISLAND_A, ISLAND_B, ISLAND_BASE_H, ISLAND_BASE_W, ISLAND_SCALE, MAX_LVL, WEAPONS, soldierCap, soldierPrice } from "@/game/data";
import type { HudState } from "@/game/types";

const ROLE_NAMES: Record<string, string> = { kapitan: "Kapitan", askar: "Askar", dushman: "Qaroqchi", shoh: "Qaroqchi shohi", asir: "Asir", ovchi: "Ovchi", ayol: "Ayol" };
const ROLE_COLORS: Record<string, string> = { kapitan: "#ffd36b", askar: "#7fd0ff", dushman: "#ff7a6b", shoh: "#ff4040", asir: "#9dffb0", ovchi: "#ffd36b", ayol: "#ffb0e0" };

const FEATURES = [
  "Gerstner to'lqinli real okean + Frenel aks etish", "Quyosh yaltirashi va to'lqin ko'pigi", "Kechayu-kunduz sikli (15 daqiqa)", "Atmosfera sochilishi bilan osmon", "Yulduzli tun va oy nuri",
  "Real vaqtdagi soyalar", "Harakatlanuvchi bulutlar", "Masofaviy tuman / zarralar", "Shamolda tebranuvchi o't (20 000 poya)", "Shamolda egiluvchi palma va daraxtlar",
  "Barglar pirpirashi", "Qamish va butalar tebranishi", "Kema yelkanlari — mato simulyatsiyasi", "Hilpiragan bayroqlar", "To'lqinda tebranuvchi kema (tebranish/og'ish)",
  "Kema ortidagi ko'pikli iz", "Otishda yorug'lik chaqnashi", "Iz qoldiruvchi o'qlar (tracer)", "Zarbadagi chang va uchqunlar", "Suvga tushgan o'q — sachrash",
  "Portlash, olov va tutun", "Qor yog'ishi", "Sovuqda nafasdan bug' chiqishi", "Yomg'ir", "Kul va cho'g'", "Sakura gulbarglari", "Kuz barglari", "Qum bo'roni",
  "Kunduzi kapalaklar", "Tunda cho'g'chi qurtlar (firefly)", "Chayka podalari", "Sohildagi qisqichbaqalar", "Ot va uning chopishi", "Gulxan alangasi va tutuni",
  "Mayoq nuri", "Vulqon lavasi va tutun ustuni", "Billur nuri (emissiya)", "Kamera chayqalishi va qurol tebranishi", "Sirt turiga qarab qadam ovozlari", "Okean va shamol ovozi",
  "ACES kino ranglari", "Suv ostida ko'rinish", "Biom bo'yicha relyef va rang (16 xil)",
];

type Tab = "weapons" | "hero" | "ship" | "army";

export default function GameView() {
  const boxRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"loading" | "title" | "playing">("loading");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [progress, setProgress] = useState({ p: 0, msg: "Yuklanmoqda…" });
  const [hud, setHud] = useState<HudState | null>(null);
  const hudRef = useRef<HudState | null>(null);
  const [menu, setMenu] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [pauseOverlay, setPauseOverlay] = useState(false);
  const [tab, setTab] = useState<Tab>("weapons");
  const [, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [name, setName] = useState("Kapitan");
  const [room, setRoom] = useState("");
  const [showFeat, setShowFeat] = useState(false);
  const uiRef = useRef({ menu: false, map: false, chat: false });
  uiRef.current = { menu, map: mapOpen, chat: chatOpen };

  useEffect(() => {
    const n = localStorage.getItem("aether_name");
    if (n) setName(n);
    const r = localStorage.getItem("aether_room");
    if (r) setRoom(r);
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    const g = new Game(box);
    gameRef.current = g;
    g.onHud = (h) => {
      hudRef.current = h;
      setHud(h);
    };
    g.onLock = (l) => {
      if (phaseRef.current !== "playing") return;
      if (l) {
        setPauseOverlay(false);
        g.setPaused(false);
      } else if (!uiRef.current.menu && !uiRef.current.map && !uiRef.current.chat) {
        g.setPaused(true);
        setPauseOverlay(true);
      }
    };
    g.init((p, msg) => !cancelled && setProgress({ p, msg }))
      .then(() => {
        if (cancelled) g.dispose();
        else setPhase("title");
      })
      .catch((e) => {
        console.error(e);
        setProgress({ p: 1, msg: "Xatolik: " + String(e) });
      });
    return () => {
      cancelled = true;
      if (gameRef.current) gameRef.current.dispose();
      gameRef.current = null;
    };
  }, []);

  const resume = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.setPaused(false);
    setPauseOverlay(false);
    g.requestLock();
  }, []);

  const closeUi = useCallback(() => {
    setMenu(false);
    setMapOpen(false);
    setChatOpen(false);
    resume();
  }, [resume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || phaseRef.current !== "playing") return;
      const tgt = e.target as HTMLElement;
      if (tgt && tgt.tagName === "INPUT") {
        if (e.code === "Escape") {
          setChatOpen(false);
          resume();
        }
        return;
      }
      const ui = uiRef.current;
      if (e.code === "KeyB" || e.code === "Tab") {
        e.preventDefault();
        if (ui.menu) closeUi();
        else {
          setMapOpen(false);
          setMenu(true);
          g.setPaused(true);
          document.exitPointerLock();
        }
      } else if (e.code === "KeyM") {
        if (ui.map) closeUi();
        else {
          setMenu(false);
          setMapOpen(true);
          g.setPaused(true);
          document.exitPointerLock();
        }
      } else if (e.code === "Enter" && !ui.chat) {
        e.preventDefault();
        setChatOpen(true);
        document.exitPointerLock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeUi, resume]);

  // toast timeout
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // map drawing
  useEffect(() => {
    if (!mapOpen) return;
    const cv = mapRef.current;
    if (!cv) return;
    const draw = () => {
      const h = hudRef.current;
      const ctx = cv.getContext("2d");
      if (!ctx || !h) return;
      const W = cv.width, H = cv.height;
      const minX = -4300, maxX = 4300, minZ = -5200, maxZ = 5200;
      const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
      const sz = (z: number) => ((z - minZ) / (maxZ - minZ)) * H;
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#0b3a5a");
      grd.addColorStop(1, "#06243a");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let x = -4000; x <= 4000; x += 1000) { ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), H); ctx.stroke(); }
      for (let z = -5000; z <= 5000; z += 1000) { ctx.beginPath(); ctx.moveTo(0, sz(z)); ctx.lineTo(W, sz(z)); ctx.stroke(); }
      ISLANDS.forEach((isl, i) => {
        const b = BIOMES[isl.biome];
        const rx = (ISLAND_A / (maxX - minX)) * W;
        const ry = (ISLAND_B / (maxZ - minZ)) * H;
        const owner = h.roomOwners[i];
        const cap = h.captured.includes(i);
        ctx.beginPath();
        ctx.ellipse(sx(isl.cx), sz(isl.cz), rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#" + b.sand.toString(16).padStart(6, "0");
        ctx.globalAlpha = 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.ellipse(sx(isl.cx), sz(isl.cz), rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#" + b.grassA.toString(16).padStart(6, "0");
        ctx.fill();
        ctx.lineWidth = cap || owner ? 3 : 1;
        ctx.strokeStyle = cap ? "#ffd36b" : owner ? "#7fd0ff" : "rgba(255,255,255,0.35)";
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), sx(isl.cx), sz(isl.cz) + 4);
        ctx.font = "10px Inter, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(isl.name, sx(isl.cx), sz(isl.cz) + ry * 1.05 + 12);
        if (cap || owner) ctx.fillText(cap ? "⚑ siz" : "⚑ " + owner, sx(isl.cx), sz(isl.cz) - ry * 0.5);
      });
      // remote
      h.remote.forEach((r) => {
        ctx.fillStyle = "#7fd0ff";
        ctx.beginPath();
        ctx.arc(sx(r.x), sz(r.z), 5, 0, 7);
        ctx.fill();
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText(r.name, sx(r.x), sz(r.z) - 8);
      });
      // ship
      ctx.save();
      ctx.translate(sx(h.shipPos.x), sz(h.shipPos.z));
      ctx.rotate(-h.shipPos.yaw + Math.PI);
      ctx.fillStyle = "#ffd36b";
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.closePath();
      ctx.fill();
      ctx.restore();
      // player
      ctx.save();
      ctx.translate(sx(h.playerPos.x), sz(h.playerPos.z));
      ctx.rotate(-h.playerPos.yaw + Math.PI);
      ctx.fillStyle = "#ff5a5a";
      ctx.strokeStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    draw();
    const t = setInterval(draw, 250);
    return () => clearInterval(t);
  }, [mapOpen]);

  const start = (withRoom: boolean) => {
    const g = gameRef.current;
    if (!g) return;
    const nm = name.trim().slice(0, 16) || "Kapitan";
    localStorage.setItem("aether_name", nm);
    const rm = withRoom ? room.trim() : "";
    if (withRoom) localStorage.setItem("aether_room", rm);
    g.start(nm, rm || null);
    setPhase("playing");
    phaseRef.current = "playing";
    g.requestLock();
  };

  const act = (fn: () => string) => {
    const m = fn();
    setToast(m);
    setTick((t) => t + 1);
  };

  const g = gameRef.current;
  const h = hud;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#04101c] select-none">
      <div ref={boxRef} className="absolute inset-0" />

      {phase === "loading" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[radial-gradient(ellipse_at_center,#0a2a44,#03070e)]">
          <div className="w-[min(520px,90vw)] text-center">
            <div className="text-5xl font-black tracking-[0.3em] text-amber-200 drop-shadow">AETHER TIDE</div>
            <div className="mt-2 text-sm tracking-[0.35em] text-sky-200/80">ORollar: GORIZONT TUTILISHI</div>
            <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-gradient-to-r from-amber-300 to-orange-500 transition-all" style={{ width: `${Math.round(progress.p * 100)}%` }} />
            </div>
            <div className="mt-3 text-sm text-sky-100/80">{progress.msg}</div>
          </div>
        </div>
      )}

      {phase === "title" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-gradient-to-b from-black/50 via-black/25 to-black/70 p-4">
          <div className="panel fade-up my-auto w-[min(880px,96vw)] p-6 md:p-8">
            <div className="text-center">
              <h1 className="text-4xl font-black tracking-[0.25em] text-amber-200 md:text-6xl">AETHER TIDE</h1>
              <p className="mt-2 text-xs tracking-[0.4em] text-sky-200/80 md:text-sm">ORollar: GORIZONT TUTILISHI</p>
              <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-200/90">
                Kemangizni boshqaring, 16 ta noyob biomdagi orolni egallang. Har orol — alohida vazifa, har biri {ISLAND_BASE_W}×{ISLAND_BASE_H} birlikning {ISLAND_SCALE} barobari ({ISLAND_BASE_W * ISLAND_SCALE}×{ISLAND_BASE_H * ISLAND_SCALE} m).
                Qurollarni yaxshilang, kema palubasiga askar yig&apos;ing, otda choping — do&apos;stlar bilan birga!
              </p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs uppercase tracking-widest text-slate-300">Kapitan ismi</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-amber-300" />
                <button onClick={() => start(false)} className="w-full rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-lg font-bold text-black shadow-lg transition hover:brightness-110">
                  ▶ Yakka o&apos;yin
                </button>
                <label className="block pt-2 text-xs uppercase tracking-widest text-slate-300">Multiplayer xona kodi</label>
                <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="masalan: dengiz-itlari" maxLength={24} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-white outline-none focus:border-sky-300" />
                <button disabled={!room.trim()} onClick={() => start(true)} className="w-full rounded-lg bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-3 text-lg font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40">
                  🌐 Multiplayerga kirish
                </button>
                <p className="text-xs text-slate-400">Bir xil kod kiritgan o&apos;yinchilar bitta okeanda uchrashadi: bir-birining kemasi va qahramonini ko&apos;radi, orol egallashlari va chat umumiy.</p>
              </div>
              <div className="rounded-lg bg-black/30 p-4 text-sm text-slate-200">
                <div className="mb-2 text-xs uppercase tracking-widest text-amber-200">Boshqaruv</div>
                <ul className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <li className="font-mono text-amber-100">W A S D</li><li>yurish / kema boshqaruvi</li>
                  <li className="font-mono text-amber-100">Sichqoncha</li><li>qarash · chap tugma — o&apos;q / to&apos;p</li>
                  <li className="font-mono text-amber-100">O&apos;ng tugma</li><li>nishon olish (zoom)</li>
                  <li className="font-mono text-amber-100">Shift / Space</li><li>yugurish / sakrash (kemada: tormoz)</li>
                  <li className="font-mono text-amber-100">F</li><li>kemadan tushish / kemaga chiqish</li>
                  <li className="font-mono text-amber-100">T</li><li>kemaga qaytish</li>
                  <li className="font-mono text-amber-100">H</li><li>ot chaqirish / minish</li>
                  <li className="font-mono text-amber-100">E</li><li>o&apos;zaro ta&apos;sir (sandiq, chiroq, asir)</li>
                  <li className="font-mono text-amber-100">R · 1-6 · g&apos;ildirak</li><li>qayta o&apos;qlash · qurol tanlash</li>
                  <li className="font-mono text-amber-100">V</li><li>askarlar: ortimdan / hujum</li>
                  <li className="font-mono text-amber-100">B</li><li>do&apos;kon va yaxshilash</li>
                  <li className="font-mono text-amber-100">M · Enter</li><li>xarita · chat</li>
                </ul>
                <button onClick={() => setShowFeat((s) => !s)} className="mt-3 text-xs text-sky-300 underline">
                  {showFeat ? "Grafika ro'yxatini yopish" : `Grafika va realizm: ${FEATURES.length} ta element`}
                </button>
              </div>
            </div>
            {showFeat && (
              <div className="mt-4 grid max-h-52 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-lg bg-black/30 p-3 text-xs text-slate-200 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.map((f, i) => (
                  <div key={f}><span className="text-amber-300">{i + 1}.</span> {f}</div>
                ))}
              </div>
            )}
            <p className="mt-4 text-center text-[11px] text-slate-400">Ovozli qahramonlar o&apos;zbekcha gapiradi (brauzerda o&apos;zbek, bo&apos;lmasa turk/rus ovozi ishlatiladi) · Kompyuter va sichqoncha tavsiya etiladi</p>
          </div>
        </div>
      )}

      {phase === "playing" && h && (
        <>
          {/* vignettes */}
          <div className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: `inset 0 0 ${120 + h.hit * 160}px rgba(255,0,0,${h.hit * 0.75})` }} />
          {h.cold && <div className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: "inset 0 0 140px rgba(190,225,255,0.28)" }} />}
          {h.underwater && <div className="pointer-events-none absolute inset-0 z-10 bg-cyan-700/45" />}
          {h.zoom && <div className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(circle at center, transparent 0, transparent 30vh, #000 31vh)" }}><div className="absolute left-1/2 top-0 h-full w-px bg-black/70" /><div className="absolute left-0 top-1/2 h-px w-full bg-black/70" /></div>}

          {/* crosshair */}
          {h.mode !== "ship" && !h.zoom && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              <div className="h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_4px_#000]" />
              <div className="absolute -left-3 top-[2px] h-[2px] w-2 bg-white/70" /><div className="absolute -right-3 top-[2px] h-[2px] w-2 bg-white/70" />
              <div className="absolute -top-3 left-[2px] h-2 w-[2px] bg-white/70" /><div className="absolute -bottom-3 left-[2px] h-2 w-[2px] bg-white/70" />
            </div>
          )}
          {h.mode === "ship" && <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50" />}

          {/* top-left status */}
          <div className="absolute left-3 top-3 z-20 w-64 space-y-2">
            <div className="panel p-3">
              <div className="flex items-center justify-between text-xs"><span>♥ Sog&apos;liq</span><span>{Math.ceil(h.hp)}/{h.maxHp}</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded bg-white/10"><div className="h-full bg-gradient-to-r from-red-500 to-rose-400" style={{ width: `${(h.hp / h.maxHp) * 100}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-xs"><span>⚓ Kema</span><span>{Math.ceil(h.shipHp)}/{h.shipMax}</span></div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${(h.shipHp / h.shipMax) * 100}%` }} /></div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="gold font-bold">⛁ {h.gold}</span>
                <span>⚔ {h.soldiers}/{h.cap}</span>
                <span className="text-slate-300">🕒 {h.clock}</span>
              </div>
              {h.armor > 0 && <div className="mt-1 text-[11px] text-sky-200">Zirh: −{Math.round(h.armor * 100)}% zarar</div>}
            </div>
            {h.island && (
              <div className="panel px-3 py-2 text-sm">
                <div className="font-semibold text-amber-100">{h.island}</div>
                <div className="text-xs text-slate-300">{h.biome}</div>
              </div>
            )}
          </div>

          {/* top-center compass */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
            <div className="panel flex items-center gap-3 px-4 py-1.5 text-sm">
              <span className="font-mono text-amber-100">{Math.round(h.heading).toString().padStart(3, "0")}°</span>
              <span className="text-slate-300">{["Sh", "SSh", "Sq", "JSq", "J", "JG'", "G'", "SG'"][Math.round(h.heading / 45) % 8]}</span>
              {h.mission && !h.mission.complete && (
                <span className="flex items-center gap-2 text-amber-200">
                  <span className="inline-block text-lg" style={{ transform: `rotate(${-h.mission.bearing}deg)` }}>➤</span>
                  <span className="text-xs">{h.mission.dist > 1000 ? (h.mission.dist / 1000).toFixed(1) + " km" : Math.round(h.mission.dist) + " m"}</span>
                </span>
              )}
            </div>
          </div>

          {/* top-right mission + players */}
          <div className="absolute right-3 top-3 z-20 w-72 space-y-2">
            {h.mission && (
              <div className="panel p-3">
                <div className="text-[11px] uppercase tracking-widest text-sky-200/80">{h.mission.island}</div>
                <div className="text-base font-bold text-amber-200">{h.mission.title}</div>
                <div className="mt-1 text-xs text-slate-200">{h.mission.complete ? "✔ Orol egallandi!" : h.mission.desc}</div>
                {!h.mission.complete && (
                  <>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span>{h.mission.noun[0].toUpperCase() + h.mission.noun.slice(1)}</span>
                      <span className="font-mono">{h.mission.progress}/{h.mission.target}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-gradient-to-r from-emerald-400 to-lime-300" style={{ width: `${(h.mission.progress / h.mission.target) * 100}%` }} /></div>
                    {h.mission.timeLeft !== null && <div className="mt-1 text-right font-mono text-sm text-rose-300">⏱ {Math.floor(h.mission.timeLeft / 60)}:{String(Math.floor(h.mission.timeLeft % 60)).padStart(2, "0")}</div>}
                  </>
                )}
              </div>
            )}
            <div className="panel px-3 py-2 text-xs">
              <div className="flex justify-between"><span className="text-slate-300">Egallangan orollar</span><span className="gold font-bold">{h.captured.length}/16</span></div>
              {h.room && (
                <div className="mt-1 border-t border-white/10 pt-1">
                  <div className="flex justify-between"><span>🌐 Xona: <b>{h.room}</b></span><span className={h.connected ? "text-emerald-300" : "text-rose-300"}>{h.connected ? "ulangan" : "ulanmoqda…"}</span></div>
                  {h.players.length === 0 ? <div className="text-slate-400">Boshqa o&apos;yinchilar yo&apos;q</div> : h.players.map((p, i) => <div key={i} className="text-sky-200">● {p.name} — {p.island}</div>)}
                </div>
              )}
              <div className="mt-1 text-right text-[10px] text-slate-500">{h.fps} FPS</div>
            </div>
          </div>

          {/* bottom-left: notices + chat */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 w-80 space-y-1 text-sm">
            {h.chat.map((c, i) => (
              <div key={`c${i}`} className="rounded bg-black/40 px-2 py-0.5"><b className="text-sky-300">{c.name}:</b> {c.text}</div>
            ))}
            {h.notices.map((n, i) => (
              <div key={`n${i}`} className="fade-up rounded bg-black/45 px-2 py-0.5 text-amber-100">{n}</div>
            ))}
            {chatOpen && (
              <form
                className="pointer-events-auto"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chatText.trim()) g?.mp.sendChat(chatText);
                  setChatText("");
                  setChatOpen(false);
                  resume();
                }}
              >
                <input autoFocus value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={140} placeholder="Xabar yozing… (Enter)" className="w-full rounded border border-sky-300/50 bg-black/70 px-2 py-1 text-white outline-none" />
              </form>
            )}
          </div>

          {/* bottom-right weapon / ship */}
          <div className="absolute bottom-3 right-3 z-20 w-64">
            {h.mode === "ship" ? (
              <div className="panel p-3 text-sm">
                <div className="flex justify-between"><span className="font-bold text-amber-200">⚓ Kema</span><span className="font-mono">{h.speed.toFixed(0)} tugun</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${Math.max(0, h.throttle) * 100}%` }} /></div>
                <div className="mt-1 text-[11px] text-slate-300">W/S — yelkan · A/D — rul · Space — tormoz · Chap tugma — to&apos;plar</div>
                <div className="text-[11px] text-slate-300">F — qirg&apos;oqqa tushish</div>
              </div>
            ) : (
              <div className="panel p-3 text-right">
                <div className="text-xs uppercase tracking-widest text-slate-300">{h.weapon}</div>
                <div className="text-4xl font-black tabular-nums text-white">{h.reloading ? <span className="text-xl text-amber-300">QAYTA O&apos;QLANMOQDA…</span> : <>{h.ammo}<span className="text-xl text-slate-400"> / {h.mag}</span></>}</div>
                <div className="mt-1 flex justify-end gap-1">
                  {WEAPONS.map((w, i) => (
                    <span key={w.id} className={`h-5 w-5 rounded text-center text-xs leading-5 ${i === h.weaponId ? "bg-amber-400 text-black" : g?.save.owned[i] ? "bg-white/20" : "bg-white/5 text-slate-600"}`}>{i + 1}</span>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{h.stance === "attack" ? "Askarlar: HUJUM" : "Askarlar: ortimdan"} (V)</div>
              </div>
            )}
          </div>

          {/* prompts + subtitles */}
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-[min(720px,90vw)] -translate-x-1/2 space-y-2 text-center">
            {h.prompt && <div className="fade-up mx-auto w-fit rounded-lg border border-amber-300/60 bg-black/60 px-4 py-1.5 text-lg font-bold text-amber-200">{h.prompt}</div>}
            {h.subtitle && (
              <div className="fade-up mx-auto w-fit max-w-full rounded-lg bg-black/65 px-4 py-2 text-base shadow-lg">
                <span className="mr-2 font-bold" style={{ color: ROLE_COLORS[h.subtitle.role] ?? "#fff" }}>{ROLE_NAMES[h.subtitle.role] ?? h.subtitle.role}:</span>
                <span className="text-white">{h.subtitle.text}</span>
              </div>
            )}
          </div>

          {/* hit marker */}
          {g && g.hitMark > 0 && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-2xl font-black text-red-400">✕</div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-[11px] text-slate-400/80">B — do&apos;kon · M — xarita · Enter — chat · H — ot · T — kemaga qaytish · E — ta&apos;sir</div>
        </>
      )}

      {pauseOverlay && phase === "playing" && !menu && !mapOpen && !chatOpen && (
        <div onClick={resume} className="absolute inset-0 z-40 grid cursor-pointer place-items-center bg-black/55">
          <div className="panel fade-up px-10 py-8 text-center">
            <div className="text-3xl font-black tracking-widest text-amber-200">PAUZA</div>
            <div className="mt-2 text-slate-200">Davom etish uchun bosing</div>
            <div className="mt-4 text-xs text-slate-400">B — do&apos;kon · M — xarita</div>
          </div>
        </div>
      )}

      {/* map */}
      {mapOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeUi()}>
          <div className="panel fade-up p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-bold text-amber-200">Dunyo xaritasi — 16 orol</div>
              <button onClick={closeUi} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">Yopish (M)</button>
            </div>
            <canvas ref={mapRef} width={560} height={680} className="max-h-[78vh] rounded-lg" style={{ aspectRatio: "560/680" }} />
            <div className="mt-2 text-xs text-slate-300">🔺 qizil — siz · 🔺 sariq — kema · ⚑ egallangan orollar oltin hoshiyali</div>
          </div>
        </div>
      )}

      {/* shop menu */}
      {menu && g && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-3" onClick={(e) => e.target === e.currentTarget && closeUi()}>
          <div className="panel fade-up flex max-h-[92vh] w-[min(980px,96vw)] flex-col p-4">
            <div className="flex items-center justify-between">
              <div className="text-xl font-black tracking-widest text-amber-200">DO&apos;KON VA YAXSHILASH</div>
              <div className="flex items-center gap-3">
                <span className="gold text-lg font-bold">⛁ {g.save.gold}</span>
                <button onClick={closeUi} className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20">Yopish (B)</button>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              {(["weapons", "hero", "ship", "army"] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === t ? "bg-amber-400 text-black" : "bg-white/10 hover:bg-white/20"}`}>
                  {{ weapons: "🔫 Qurollar", hero: "🧍 Qahramon", ship: "⛵ Kema", army: "⚔ Qo'shin" }[t]}
                </button>
              ))}
              {toast && <span className="ml-auto self-center rounded bg-emerald-500/20 px-3 py-1 text-sm text-emerald-200">{toast}</span>}
            </div>
            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              {tab === "weapons" && (
                <div className="grid gap-3 md:grid-cols-2">
                  {WEAPONS.map((w, i) => {
                    const owned = g.save.owned[i];
                    const lv = g.save.wlvl[i];
                    return (
                      <div key={w.id} className={`rounded-lg border p-3 ${g.weapon.cur === i ? "border-amber-300/70 bg-amber-300/5" : "border-white/10 bg-black/25"}`}>
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-white">{i + 1}. {w.name}</div>
                          <button onClick={() => act(() => g.buyWeapon(i))} className={`rounded px-3 py-1 text-xs font-bold ${owned ? "bg-sky-500/80 text-white" : "bg-amber-400 text-black"}`}>
                            {owned ? (g.weapon.cur === i ? "Tanlangan" : "Tanlash") : `Sotib olish ⛁ ${w.price}`}
                          </button>
                        </div>
                        <div className="mt-1 grid grid-cols-4 gap-1 text-[11px] text-slate-300">
                          <span>Zarar {Math.round(g.wDmg(i))}{w.pellets > 1 ? `×${w.pellets}` : ""}</span><span>Tezlik {g.wRate(i).toFixed(1)}/s</span><span>O&apos;q {g.magSize(i)}</span><span>Qayta {w.reload}s</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {(["dmg", "mag", "rate"] as const).map((s) => (
                            <UpRow key={s} label={{ dmg: "Zarar kuchi", mag: "Magazin", rate: "Otish tezligi" }[s]} lvl={lv[s]} cost={g.weaponUpgradeCost(i, s)} disabled={!owned} onBuy={() => act(() => g.upgradeWeapon(i, s))} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {tab === "hero" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <UpCard title="Sog'liq" desc="+25 maksimal sog'liq" lvl={g.save.hpLvl} cost={g.statCost("hpLvl")} onBuy={() => act(() => g.buyStat("hpLvl"))} />
                  <UpCard title="Zirh" desc="Kelgan zararni −7% kamaytiradi" lvl={g.save.armorLvl} cost={g.statCost("armorLvl")} onBuy={() => act(() => g.buyStat("armorLvl"))} />
                  <UpCard title="Chaqqonlik" desc="+5% yurish va ot tezligi" lvl={g.save.speedLvl} cost={g.statCost("speedLvl")} onBuy={() => act(() => g.buyStat("speedLvl"))} />
                </div>
              )}
              {tab === "ship" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <UpCard title="Korpus" desc="+250 kema mustahkamligi" lvl={g.save.hullLvl} cost={g.statCost("hullLvl")} onBuy={() => act(() => g.buyStat("hullLvl"))} />
                  <UpCard title="Yelkanlar" desc="+3 m/s maksimal tezlik" lvl={g.save.sailLvl} cost={g.statCost("sailLvl")} onBuy={() => act(() => g.buyStat("sailLvl"))} />
                  <UpCard title="To'plar" desc="+25% to'p zarari, tezroq o'qlash" lvl={g.save.cannonLvl} cost={g.statCost("cannonLvl")} onBuy={() => act(() => g.buyStat("cannonLvl"))} />
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <div className="font-bold">Ta&apos;mirlash</div>
                    <div className="text-xs text-slate-300">Kema: {Math.ceil(g.ship.hp)}/{g.ship.maxHp}</div>
                    <button onClick={() => act(() => g.repairShip())} className="mt-2 rounded bg-amber-400 px-3 py-1 text-xs font-bold text-black">Ta&apos;mirlash ⛁ {Math.ceil((g.ship.maxHp - g.ship.hp) * 0.6)}</button>
                  </div>
                </div>
              )}
              {tab === "army" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <div className="font-bold">Askar yollash</div>
                    <div className="text-xs text-slate-300">Palubada: {g.save.soldiers}/{soldierCap(g.save)} · Askarlar quruqlikda ortingizdan yuradi va dushmanga otadi</div>
                    <button onClick={() => act(() => g.hire())} className="mt-2 rounded bg-amber-400 px-3 py-1.5 text-sm font-bold text-black">Yollash ⛁ {soldierPrice(g.save)}</button>
                  </div>
                  <UpCard title="Paluba sig'imi" desc="+3 askar o'rni" lvl={g.save.capLvl} cost={g.statCost("capLvl")} onBuy={() => act(() => g.buyStat("capLvl"))} />
                  <UpCard title="Askar quroli" desc="+20% askarlar zarari" lvl={g.save.sdmgLvl} cost={g.statCost("sdmgLvl")} onBuy={() => act(() => g.buyStat("sdmgLvl"))} />
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-slate-300">
                    Asirlarni qutqarsangiz, ular ham qo&apos;shiningizga qo&apos;shiladi. <b>V</b> tugmasi — hujum / ortimdan buyrug&apos;i.
                  </div>
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-400">
              <span>Hisob avtomatik saqlanadi</span>
              <button onClick={() => { if (confirm("Barcha progress o'chiriladi. Davom etasizmi?")) g.resetProgress(); }} className="text-rose-300 underline">Progressni tiklash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pips({ lvl }: { lvl: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: MAX_LVL }).map((_, i) => (
        <span key={i} className={`h-2 w-3 rounded-sm ${i < lvl ? "bg-amber-400" : "bg-white/15"}`} />
      ))}
    </span>
  );
}

function UpRow({ label, lvl, cost, onBuy, disabled }: { label: string; lvl: number; cost: number; onBuy: () => void; disabled?: boolean }) {
  const max = lvl >= MAX_LVL;
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="w-24 text-slate-200">{label}</span>
      <Pips lvl={lvl} />
      <button disabled={disabled || max} onClick={onBuy} className="w-24 rounded bg-white/10 px-2 py-1 font-semibold hover:bg-amber-400 hover:text-black disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-inherit">
        {max ? "MAX" : `⛁ ${cost}`}
      </button>
    </div>
  );
}

function UpCard({ title, desc, lvl, cost, onBuy }: { title: string; desc: string; lvl: number; cost: number; onBuy: () => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="flex items-center justify-between"><div className="font-bold">{title}</div><Pips lvl={lvl} /></div>
      <div className="text-xs text-slate-300">{desc}</div>
      <button disabled={lvl >= MAX_LVL} onClick={onBuy} className="mt-2 rounded bg-amber-400 px-3 py-1 text-xs font-bold text-black disabled:opacity-30">{lvl >= MAX_LVL ? "MAX" : `Yaxshilash ⛁ ${cost}`}</button>
    </div>
  );
}
