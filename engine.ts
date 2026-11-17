import * as THREE from "three";
import { AudioSys, LINES, type Role, type Surface } from "./audio";
import { BIOMES, ISLANDS, ISLAND_A, ISLAND_B, MAX_LVL, WEAPONS, defaultSave, soldierCap, soldierPrice, upgradeCost, type Save } from "./data";
import { Environment, waveHeight } from "./environment";
import { buildHumanoid, buildQuadruped, buildShip, buildViewModel, SHIP_L, SHIP_W, type Quadruped, type Ship } from "./entities";
import { Particles, Tracers, WeatherField, pointScale } from "./fx";
import { clamp, lerp, mulberry32, smoothstep } from "./noise";
import type { EShip, HudState, IslandRT, Mob, Projectile, Tower } from "./types";
import { GrassField, lavaMat, windU } from "./vegetation";
import { World, makeDetailTexture } from "./world";
import { damageEShip, damageMob, damageTower, hireSoldier, restoreSoldiers, setSoldiersOnDeck, updateEnemyShips, updateMobs, updateTowers } from "./mobs";
import { getInteractable, manageIslands, missionHud, updateMissions, type Interactable } from "./islands";
import { MP } from "./mp";

const SAVE_KEY = "aether_tide_v2";

export class Game {
  container: HTMLElement;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, 1, 0.1, 24000);
  env!: Environment;
  world = new World();
  audio = new AudioSys();
  grass!: GrassField;
  smoke!: Particles;
  glow!: Particles;
  weather!: WeatherField;
  fireflies!: WeatherField;
  tracers!: Tracers;
  terrainMat!: THREE.MeshStandardMaterial;
  save: Save = defaultSave();
  time = 0;
  keys = new Set<string>();
  paused = true;
  started = false;
  locked = false;
  mouseDown = false;
  aiming = false;
  mdx = 0;
  mdy = 0;

  player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, hp: 100, maxHp: 100, onGround: true, mode: "foot" as "foot" | "ship" | "horse", stepAcc: 0, bob: 0, lastHurt: -99, breathT: 0, speed: 0 };
  shipObj!: Ship;
  ship = { pos: new THREE.Vector3(), yaw: 0, speed: 0, hp: 600, maxHp: 600, throttle: 0, rudder: 0, cd: 0, wake: 0 };
  horse = { q: null as Quadruped | null, pos: new THREE.Vector3(), yaw: 0, speed: 0, spawned: false, breathT: 0 };
  vm!: THREE.Group;
  vmId = -1;
  vmKick = 0;
  vmReload = 0;
  weapon = { cur: 0, ammo: [] as number[], reloadT: 0, cd: 0 };
  flashLight!: THREE.PointLight;
  flashT = 0;
  shake = 0;
  hitFlash = 0;
  hitMark = 0;

  mobs: Mob[] = [];
  towers: Tower[] = [];
  eships: EShip[] = [];
  projectiles: Projectile[] = [];
  rt: IslandRT[] = [];
  cannonQueue: { t: number; idx: number; dir: THREE.Vector3; side: number }[] = [];
  stance: "follow" | "attack" = "follow";
  mobId = 1;
  eshipTimer = 2;

  notices: { text: string; t: number }[] = [];
  subtitle: { role: string; text: string; t: number } | null = null;
  interact: Interactable | null = null;
  interactT = 0;
  mp: MP;
  onHud: ((h: HudState) => void) | null = null;
  onLock: ((l: boolean) => void) | null = null;
  hudT = 0;
  fps = 60;
  fpsAcc = 0;
  fpsN = 0;
  curIsland = -1; // island whose waters/land we're on (by distance)
  nearIdx = 0;
  nearR = 99;
  weatherAmt = 0;
  underwater = false;
  lastSave = 0;
  lastBark = 0;
  lastPraise = 0;
  spawnPoint = new THREE.Vector3();

  // ambient creatures
  gulls: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; ang: number; rad: number; alt: number; spd: number; ph: number }[] = [];
  butterflies: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; off: THREE.Vector3; ph: number; spd: number }[] = [];
  crabs: { g: THREE.Group; pos: THREE.Vector3; dir: number; ph: number; flee: number }[] = [];
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private raf = 0;
  private last = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.mp = new MP(this);
  }

  /* ------------------------------------------------------------------ init */
  async init(progress: (p: number, msg: string) => void) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(this.container.clientWidth, this.container.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(r.domElement);
    r.domElement.style.display = "block";
    this.renderer = r;
    this.scene.add(this.camera);

    await this.initWorld(progress);
  }

  async initWorld(progress: (p: number, msg: string) => void) {
    progress(0.03, "Okean va osmon tayyorlanmoqda…");
    this.env = new Environment(this.scene);
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: makeDetailTexture(), roughness: 0.96, metalness: 0 });
    this.grass = new GrassField();
    this.scene.add(this.grass.mesh);
    this.smoke = new Particles(5000, false);
    this.glow = new Particles(2500, true);
    this.tracers = new Tracers();
    this.weather = new WeatherField(5200, false, [80, 50, 80]);
    this.fireflies = new WeatherField(140, true, [70, 14, 70]);
    this.fireflies.u.uSize.value = 0.22;
    this.fireflies.u.uSway.value = 3.2;
    this.fireflies.u.uTwinkle.value = 1;
    (this.fireflies.u.uColor.value as THREE.Color).setRGB(0.75, 1, 0.3);
    this.scene.add(this.smoke.points, this.glow.points, this.tracers.lines, this.weather.points, this.fireflies.points);

    this.flashLight = new THREE.PointLight(0xffc070, 0, 40, 1.8);
    this.scene.add(this.flashLight);

    // islands
    for (let i = 0; i < ISLANDS.length; i++) {
      const isl = this.world.islands[i];
      isl.generate();
      isl.group.position.set(isl.def.cx, 0, isl.def.cz);
      const lo = new THREE.Mesh(isl.buildGeometry(4), this.terrainMat);
      lo.receiveShadow = false;
      isl.lo = lo;
      isl.group.add(lo);
      isl.group.add(isl.vegGroup);
      isl.vegGroup.visible = false;
      this.scene.add(isl.group);
      this.rt.push({
        idx: i, active: false, camps: [], campsMade: false, objs: [], cloths: [], fires: [], flagCloth: null, flagObj: null, lighthouse: null, lava: null, animalsSpawned: false,
        mission: { done: 0, complete: false, started: false, timer: 0, waveT: 0, wave: 0, warn: 0, spots: [], taken: [], items: [], eshipsSpawned: false, bossSpoken: false, outside: 0 },
      });
      if (this.disposed) return;
      progress(0.08 + (i / ISLANDS.length) * 0.7, `${i + 1}/16 orol yaratilmoqda: ${ISLANDS[i].name}`);
      await new Promise((res) => setTimeout(res, 0));
    }

    progress(0.82, "Kema va qurollar yig'ilmoqda…");
    this.shipObj = buildShip({ sail: 0xf0e8d0, hull: 0x7a4a26, accent: 0xb8892e, flag: 0x1f6fd0, light: true });
    this.scene.add(this.shipObj.group);
    this.shipObj.group.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));

    this.buildAmbient();
    this.loadSave();
    this.weapon.ammo = WEAPONS.map((_, i) => this.magSize(i));
    this.setVm(this.weapon.cur);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("contextmenu", this.onCtx);
    this.onResize();

    // initial placement: sail spot south of island 0
    const i0 = ISLANDS[0];
    const sp = this.findSeaSpot(i0.cx, i0.cz, Math.PI / 2);
    if (!this.save.captured.length || true) {
      this.ship.pos.set(sp.x, 0, sp.z);
      this.ship.yaw = 0;
    }
    this.restoreShipPos();
    this.player.mode = "ship";
    this.applyStats();
    this.player.hp = this.player.maxHp;
    this.ship.hp = this.ship.maxHp;
    this.updateShipTransform(0);
    this.syncPlayerToShip();
    this.player.yaw = this.ship.yaw + Math.PI;
    this.player.pitch = -0.05;
    progress(1, "Tayyor!");
    this.renderFrame();
    this.raf = requestAnimationFrame(this.loop);
  }

  findSeaSpot(cx: number, cz: number, angle: number) {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    for (let d = 500; d < 2000; d += 20) {
      let ok = true;
      for (let k = 0; k < 8; k++) {
        const x = cx + dx * (d + k * 20);
        const z = cz + dz * (d + k * 20);
        if (this.world.groundHeight(x, z) > -6) {
          ok = false;
          break;
        }
      }
      if (ok) return { x: cx + dx * (d + 30), z: cz + dz * (d + 30) };
    }
    return { x: cx + dx * 1100, z: cz + dz * 1100 };
  }

  private buildAmbient() {
    const wm = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8, side: THREE.DoubleSide });
    const wingGeo = new THREE.BoxGeometry(1.1, 0.03, 0.32).translate(0.55, 0, 0);
    const bodyGeo = new THREE.BoxGeometry(0.25, 0.2, 0.7);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, wm));
      const wl = new THREE.Mesh(wingGeo, wm);
      const wr = new THREE.Mesh(wingGeo, wm);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.scale.setScalar(1.3);
      this.scene.add(g);
      this.gulls.push({ g, wl, wr, ang: Math.random() * 6.28, rad: 60 + Math.random() * 260, alt: 25 + Math.random() * 60, spd: 0.08 + Math.random() * 0.12, ph: Math.random() * 6 });
    }
    const wg = new THREE.PlaneGeometry(0.16, 0.12).translate(0.08, 0, 0);
    const cols = [0xffa030, 0xff5a8a, 0xffe040, 0x60b0ff, 0xffffff];
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.7, emissive: cols[i % cols.length], emissiveIntensity: 0.12 });
      const wl = new THREE.Mesh(wg, m);
      const wr = new THREE.Mesh(wg, m);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.visible = false;
      this.scene.add(g);
      this.butterflies.push({ g, wl, wr, off: new THREE.Vector3((Math.random() - 0.5) * 40, 0.6 + Math.random() * 2.5, (Math.random() - 0.5) * 40), ph: Math.random() * 6, spd: 0.6 + Math.random() });
    }
    const cm = new THREE.MeshStandardMaterial({ color: 0xc8502a, roughness: 0.7 });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), cm);
      b.scale.set(1, 0.5, 0.8);
      g.add(b);
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), cm);
        c.position.set(s * 0.2, 0.03, 0.13);
        g.add(c);
      }
      g.visible = false;
      this.scene.add(g);
      this.crabs.push({ g, pos: new THREE.Vector3(1e6, 0, 1e6), dir: Math.random() * 6, ph: Math.random() * 6, flee: 0 });
    }
    // viewmodel + horse
    this.vm = new THREE.Group();
    this.camera.add(this.vm);
    const horse = buildQuadruped("horse", 1.05);
    horse.group.visible = false;
    this.scene.add(horse.group);
    this.horse.q = horse;
  }

  /* ---------------------------------------------------------------- stats */
  applyStats() {
    const s = this.save;
    this.player.maxHp = 100 + 25 * s.hpLvl;
    this.ship.maxHp = 600 + 250 * s.hullLvl;
    if (this.player.hp > this.player.maxHp) this.player.hp = this.player.maxHp;
  }
  get armorReduction() { return Math.min(0.5, this.save.armorLvl * 0.07); }
  get shipMaxSpeed() { return 22 + 3 * this.save.sailLvl; }
  get cannonDmg() { return 90 * (1 + 0.25 * this.save.cannonLvl); }
  get soldierDmg() { return 14 * (1 + 0.2 * this.save.sdmgLvl); }
  wDmg(i: number) { return WEAPONS[i].dmg * (1 + 0.18 * this.save.wlvl[i].dmg); }
  wRate(i: number) { return WEAPONS[i].rate * (1 + 0.1 * this.save.wlvl[i].rate); }
  magSize(i: number) { return Math.floor(WEAPONS[i].mag * (1 + 0.2 * this.save.wlvl[i].mag)); }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { save?: Save; ship?: { x: number; z: number; yaw: number } };
        if (d.save) {
          const base = defaultSave();
          this.save = { ...base, ...d.save, owned: base.owned.map((v, i) => d.save!.owned?.[i] ?? v), wlvl: base.wlvl.map((v, i) => ({ ...v, ...(d.save!.wlvl?.[i] ?? {}) })) };
        }
        (this as unknown as { _savedShip?: unknown })._savedShip = d.ship;
      }
    } catch {
      /* ignore */
    }
    for (const c of this.save.captured) this.rt[c].mission.complete = true;
  }
  restoreShipPos() {
    const d = (this as unknown as { _savedShip?: { x: number; z: number; yaw: number } })._savedShip;
    if (d && Number.isFinite(d.x) && this.world.groundHeight(d.x, d.z) < -5) {
      this.ship.pos.set(d.x, 0, d.z);
      this.ship.yaw = d.yaw;
    }
  }
  persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ save: this.save, ship: { x: this.ship.pos.x, z: this.ship.pos.z, yaw: this.ship.yaw } }));
    } catch {
      /* ignore */
    }
  }
  resetProgress() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    location.reload();
  }

  /* ----------------------------------------------------------------- shop */
  buyWeapon(i: number): string {
    const w = WEAPONS[i];
    if (this.save.owned[i]) { this.weapon.cur = i; this.setVm(i); return "Tanlandi"; }
    if (this.save.gold < w.price) return "Tilla yetarli emas";
    this.save.gold -= w.price;
    this.save.owned[i] = true;
    this.weapon.ammo[i] = this.magSize(i);
    this.weapon.cur = i;
    this.setVm(i);
    this.audio.pickup();
    this.persist();
    return `${w.name} sotib olindi`;
  }
  upgradeWeapon(i: number, stat: "dmg" | "mag" | "rate"): string {
    const lvl = this.save.wlvl[i][stat];
    if (!this.save.owned[i]) return "Avval qurolni sotib oling";
    if (lvl >= MAX_LVL) return "Maksimal daraja";
    const cost = this.weaponUpgradeCost(i, stat);
    if (this.save.gold < cost) return "Tilla yetarli emas";
    this.save.gold -= cost;
    this.save.wlvl[i][stat]++;
    if (stat === "mag") this.weapon.ammo[i] = this.magSize(i);
    this.audio.pickup();
    this.persist();
    return "Yaxshilandi!";
  }
  weaponUpgradeCost(i: number, stat: "dmg" | "mag" | "rate") {
    const base = 150 + WEAPONS[i].price * 0.35 + (stat === "dmg" ? 80 : stat === "rate" ? 40 : 0);
    return upgradeCost(Math.round(base), this.save.wlvl[i][stat]);
  }
  statCost(stat: keyof Pick<Save, "hpLvl" | "armorLvl" | "speedLvl" | "hullLvl" | "sailLvl" | "cannonLvl" | "capLvl" | "sdmgLvl">) {
    const base = { hpLvl: 220, armorLvl: 300, speedLvl: 260, hullLvl: 400, sailLvl: 350, cannonLvl: 450, capLvl: 500, sdmgLvl: 380 }[stat];
    return upgradeCost(base, this.save[stat]);
  }
  buyStat(stat: keyof Pick<Save, "hpLvl" | "armorLvl" | "speedLvl" | "hullLvl" | "sailLvl" | "cannonLvl" | "capLvl" | "sdmgLvl">): string {
    if (this.save[stat] >= MAX_LVL) return "Maksimal daraja";
    const c = this.statCost(stat);
    if (this.save.gold < c) return "Tilla yetarli emas";
    this.save.gold -= c;
    this.save[stat]++;
    const wasFull = this.player.hp >= this.player.maxHp - 0.1;
    this.applyStats();
    if (stat === "hpLvl" || wasFull) this.player.hp = this.player.maxHp;
    if (stat === "hullLvl") this.ship.hp = this.ship.maxHp;
    this.audio.pickup();
    this.persist();
    return "Yaxshilandi!";
  }
  hire(): string {
    if (this.save.soldiers >= soldierCap(this.save)) return "Kemada joy yo'q — sig'imni oshiring";
    const c = soldierPrice(this.save);
    if (this.save.gold < c) return "Tilla yetarli emas";
    this.save.gold -= c;
    hireSoldier(this, true);
    this.persist();
    return "Askar yollandi!";
  }
  repairShip(): string {
    const c = Math.ceil((this.ship.maxHp - this.ship.hp) * 0.6);
    if (c <= 0) return "Kema butun";
    if (this.save.gold < c) return "Tilla yetarli emas";
    this.save.gold -= c;
    this.ship.hp = this.ship.maxHp;
    this.audio.pickup();
    return "Kema ta'mirlandi";
  }
  hpHeal(n: number) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + n);
  }
  addGold(n: number, quiet = false) {
    this.save.gold += n;
    if (!quiet) this.notify(`+${n} tilla`);
  }

  /* ---------------------------------------------------------------- utils */
  notify(text: string) {
    this.notices.push({ text, t: this.time });
    if (this.notices.length > 8) this.notices.shift();
  }
  say(text: string, role: Role, force = false) {
    this.subtitle = { role, text, t: this.time };
    this.audio.speak(text, role, force);
  }
  sayRandom(list: string[], role: Role, force = false) {
    this.say(list[Math.floor(Math.random() * list.length)], role, force);
  }
  playerEye(out: THREE.Vector3) {
    return out.copy(this.camera.position);
  }
  /** world position of ground below + height */
  groundY(x: number, z: number) {
    return this.world.groundHeight(x, z);
  }

  /* --------------------------------------------------------------- inputs */
  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.repeat) return;
    this.keys.add(e.code);
    if (!this.started || this.paused) return;
    switch (e.code) {
      case "KeyR": this.startReload(); break;
      case "KeyF": this.toggleBoard(); break;
      case "KeyH": this.toggleHorse(); break;
      case "KeyE": if (this.interact) this.interact.act(); break;
      case "KeyV":
        this.stance = this.stance === "follow" ? "attack" : "follow";
        this.notify(this.stance === "attack" ? "Askarlar: HUJUM!" : "Askarlar: ortimdan yuring");
        this.say(this.stance === "attack" ? "Hujumga! Dushmanni yo'q qilamiz!" : "Tushundim, kapitan, ortingizdan yuramiz.", "askar", true);
        break;
      case "KeyT": this.teleportToShip(); break;
      default:
        if (e.code.startsWith("Digit")) {
          const n = parseInt(e.code.slice(5), 10) - 1;
          if (n >= 0 && n < WEAPONS.length && this.save.owned[n]) this.switchWeapon(n);
        }
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
    if (!this.locked) { this.mouseDown = false; this.aiming = false; this.keys.clear(); }
    this.onLock?.(this.locked);
  };
  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.paused) return;
    const sens = 0.0022 / (this.aiming ? WEAPONS[this.weapon.cur].zoom * 0.8 : 1);
    this.player.yaw -= e.movementX * sens;
    this.player.pitch = clamp(this.player.pitch - e.movementY * sens, -1.5, 1.5);
    this.mdx += e.movementX;
    this.mdy += e.movementY;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) return;
    if (e.button === 0) {
      this.mouseDown = true;
      if (this.player.mode === "ship") this.fireCannons();
    }
    if (e.button === 2) this.aiming = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 2) this.aiming = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!this.locked || !this.started) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    let n = this.weapon.cur;
    for (let k = 0; k < WEAPONS.length; k++) {
      n = (n + dir + WEAPONS.length) % WEAPONS.length;
      if (this.save.owned[n]) { this.switchWeapon(n); break; }
    }
  };
  private onCtx = (e: Event) => { if (this.locked) e.preventDefault(); };

  requestLock() {
    this.audio.init();
    void this.renderer.domElement.requestPointerLock();
  }
  setPaused(p: boolean) {
    this.paused = p;
  }

  start(name: string, room: string | null) {
    this.save.name = name || "Kapitan";
    this.started = true;
    this.paused = false;
    this.audio.init();
    this.mp.start(room);
    restoreSoldiers(this);
    this.sayRandom(LINES.start, "kapitan", true);
    this.notify("Orollarga yo'l oling! [F] — qirg'oqqa tushish");
    this.persist();
  }

  /* --------------------------------------------------------------- weapon */
  setVm(id: number) {
    if (this.vmId === id) return;
    this.vmId = id;
    while (this.vm.children.length) this.vm.remove(this.vm.children[0]);
    const m = buildViewModel(id);
    m.traverse((o) => { o.frustumCulled = false; });
    this.vm.add(m);
  }
  switchWeapon(n: number) {
    if (n === this.weapon.cur) return;
    this.weapon.cur = n;
    this.weapon.reloadT = 0;
    this.vmReload = 0;
    this.setVm(n);
    this.audio.reload();
  }
  startReload() {
    const w = this.weapon;
    if (w.reloadT > 0 || this.player.mode === "ship") return;
    if (w.ammo[w.cur] >= this.magSize(w.cur)) return;
    w.reloadT = WEAPONS[w.cur].reload;
    this.audio.reload();
    this.sayRandom(LINES.reload, "askar");
  }

  muzzleWorld(out: THREE.Vector3) {
    const z = (this.vm.children[0]?.userData.muzzle as number | undefined) ?? -0.5;
    out.set(this.vm.position.x, this.vm.position.y + 0.03, this.vm.position.z + z);
    this.camera.localToWorld(out);
    return out;
  }

  shoot() {
    const w = this.weapon;
    const def = WEAPONS[w.cur];
    if (w.cd > 0 || w.reloadT > 0) return;
    if (w.ammo[w.cur] <= 0) {
      this.startReload();
      return;
    }
    w.ammo[w.cur]--;
    w.cd = 1 / this.wRate(w.cur);
    this.vmKick = 1;
    this.shake = Math.max(this.shake, def.sound === "sniper" ? 0.5 : def.sound === "shotgun" ? 0.4 : def.sound === "cannon" ? 0.7 : 0.12);
    this.audio.shot(def.sound);
    this.player.pitch += (def.sound === "sniper" ? 0.03 : def.sound === "smg" ? 0.004 : 0.012) * (0.6 + Math.random() * 0.8);
    // alert nearby enemies
    for (const m of this.mobs) {
      if (m.faction === "enemy" && !m.dead && m.pos.distanceToSquared(this.player.pos) < 90 * 90) m.alert = Math.max(m.alert, 8);
    }
    const origin = this.camera.getWorldDirection(this.tmpV2).clone();
    const eye = this.camera.position.clone();
    const mz = this.muzzleWorld(new THREE.Vector3());
    this.flashLight.position.copy(mz);
    this.flashLight.intensity = 6;
    this.flashT = 0.06;
    for (let k = 0; k < 4; k++) {
      this.glow.emit(mz.x, mz.y, mz.z, origin.x * 6 + (Math.random() - 0.5) * 4, origin.y * 6 + (Math.random() - 0.5) * 4, origin.z * 6 + (Math.random() - 0.5) * 4, 0.1, 0.35, 0.05, 1, 0.75, 0.3, 0.9);
    }
    this.smoke.emit(mz.x, mz.y, mz.z, origin.x * 2, origin.y * 2 + 0.4, origin.z * 2, 1.0, 0.1, 0.7, 0.7, 0.7, 0.7, 0.28, 0, 1);

    if (def.id === 5) {
      const dir = origin.clone();
      this.spawnProjectile(mz.clone(), dir.multiplyScalar(60).add(new THREE.Vector3(0, 6, 0)), "player", this.wDmg(5), def.splash, 8, 0.08);
      return;
    }
    const right = new THREE.Vector3().crossVectors(origin, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, origin).normalize();
    for (let p = 0; p < def.pellets; p++) {
      const spr = def.spread * (this.aiming ? 0.4 : 1) * (1 + this.player.vel.length() * 0.04);
      const dir = origin.clone().addScaledVector(right, (Math.random() - 0.5) * 2 * spr).addScaledVector(up, (Math.random() - 0.5) * 2 * spr).normalize();
      const hit = this.raycast(eye, dir, def.range);
      const end = eye.clone().addScaledVector(dir, hit.t);
      if (p < 3 || def.pellets === 1) this.tracers.add(mz, end);
      this.applyHit(hit, end, dir, this.wDmg(def.id), "player");
    }
  }

  applyHit(hit: { kind: string; ref: unknown; hs: boolean }, end: THREE.Vector3, dir: THREE.Vector3, dmg: number, from: "player" | "ally") {
    switch (hit.kind) {
      case "mob": {
        const m = hit.ref as Mob;
        damageMob(this, m, hit.hs ? dmg * 2 : dmg, hit.hs, from);
        for (let i = 0; i < 4; i++) this.smoke.emit(end.x, end.y, end.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.5, 0.06, 0.25, 0.55, 0.05, 0.05, 0.6, 6, 2);
        if (from === "player") { this.hitMark = 0.18; this.audio.hit(); }
        break;
      }
      case "tower": damageTower(this, hit.ref as Tower, dmg, from); this.sparks(end, 5); if (from === "player") this.hitMark = 0.18; break;
      case "eship": damageEShip(this, hit.ref as EShip, dmg * 0.5, from); this.sparks(end, 5); if (from === "player") this.hitMark = 0.18; break;
      case "terrain": {
        for (let i = 0; i < 3; i++) this.smoke.emit(end.x, end.y, end.z, (Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6, 0.7, 0.1, 0.55, 0.62, 0.55, 0.42, 0.4, 3, 1);
        this.sparks(end, 2);
        break;
      }
      case "water": this.splash(end, 0.35); break;
      default: break;
    }
    void dir;
  }
  sparks(p: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) this.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, 0.35, 0.09, 0.02, 1, 0.8, 0.4, 1, 14, 0.5);
  }
  splash(p: THREE.Vector3, size = 1) {
    const n = Math.floor(8 + size * 14);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28;
      const s = (1 + Math.random() * 4) * size;
      this.smoke.emit(p.x, 0.2, p.z, Math.cos(a) * s * 0.5, (3 + Math.random() * 6) * size, Math.sin(a) * s * 0.5, 1.1, 0.18 * size + 0.1, 0.9 * size + 0.3, 0.9, 0.95, 1, 0.65, 16, 0.6);
    }
    this.smoke.emit(p.x, 0.15, p.z, 0, 0.1, 0, 1.8, 0.8 * size, 5 * size, 0.9, 0.97, 1, 0.45, 0, 0.5);
    this.audio.splash(size * 0.6 * clamp(1 - p.distanceTo(this.camera.position) / 400, 0, 1));
  }

  /** ray against mobs/towers/ships/terrain/water */
  raycast(o: THREE.Vector3, d: THREE.Vector3, range: number) {
    let best = { t: range, kind: "none", ref: null as unknown, hs: false };
    const test = (pos: THREE.Vector3, r: number, h: number, kind: string, ref: unknown) => {
      const cx = pos.x - o.x, cz = pos.z - o.z;
      const cy = pos.y + h * 0.5 - o.y;
      let t = cx * d.x + cy * d.y + cz * d.z;
      if (t < 0 || t > best.t + r) return;
      const qx = o.x + d.x * t, qy = o.y + d.y * t, qz = o.z + d.z * t;
      const dx = qx - pos.x, dz = qz - pos.z;
      if (dx * dx + dz * dz > r * r) return;
      if (qy < pos.y - 0.2 || qy > pos.y + h + 0.2) return;
      t -= Math.sqrt(Math.max(0, r * r - (dx * dx + dz * dz))) * 0.5;
      if (t < best.t) best = { t, kind, ref, hs: kind === "mob" && qy > pos.y + h * 0.8 };
    };
    for (const m of this.mobs) {
      if (m.dead || m.faction === "ally") continue;
      if (m.pos.distanceToSquared(o) > (range + 5) * (range + 5)) continue;
      test(m.pos, m.r, m.h, "mob", m);
    }
    for (const t of this.towers) if (!t.dead) test(t.pos, t.r, t.h, "tower", t);
    for (const s of this.eships) if (!s.dead) test(s.pos, s.r, s.h, "eship", s);
    // terrain
    const step = 1.5;
    const p = new THREE.Vector3();
    let prevT = 0.3;
    for (let t = 0.6; t < best.t; t += step) {
      p.copy(o).addScaledVector(d, t);
      const gy = this.world.groundHeight(p.x, p.z);
      if (p.y < gy) {
        let a = prevT, b = t;
        for (let k = 0; k < 5; k++) {
          const mid = (a + b) / 2;
          p.copy(o).addScaledVector(d, mid);
          if (p.y < this.world.groundHeight(p.x, p.z)) b = mid; else a = mid;
        }
        best = { t: b, kind: gy > 0 ? "terrain" : "water", ref: null, hs: false };
        break;
      }
      prevT = t;
    }
    if (d.y < 0 && best.kind !== "terrain") {
      const tw = -o.y / d.y;
      if (tw > 0 && tw < best.t) best = { t: tw, kind: "water", ref: null, hs: false };
    }
    return best;
  }

  spawnProjectile(pos: THREE.Vector3, vel: THREE.Vector3, owner: "player" | "enemy", dmg: number, splash: number, life: number, size: number) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.7 }));
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.projectiles.push({ mesh, pos: pos.clone(), vel: vel.clone(), owner, dmg, splash, life });
  }

  fireCannons() {
    const s = this.ship;
    if (s.cd > 0) return;
    s.cd = 2.4 / (1 + 0.08 * this.save.cannonLvl);
    const look = this.camera.getWorldDirection(new THREE.Vector3());
    const left = new THREE.Vector3(Math.cos(this.ship.yaw), 0, -Math.sin(this.ship.yaw));
    const side = look.dot(left) > 0 ? 1 : 0; // 1 => local +x cannons (indices 5-9)
    const dir = look.clone();
    dir.y = Math.max(dir.y, -0.1) + 0.06;
    dir.normalize();
    for (let k = 0; k < 5; k++) this.cannonQueue.push({ t: this.time + k * 0.1, idx: side * 5 + k, dir, side });
    this.sayRandom(["Olov!", "To'plar, otinglar!", "Ular tomon — olov!"], "askar");
  }

  explode(pos: THREE.Vector3, radius: number, dmg: number, owner: "player" | "enemy") {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 2 - 0.3, sp = (2 + Math.random() * 8) * (radius / 8 + 0.4);
      this.glow.emit(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * sp, e * sp * 0.8 + 3, Math.sin(a) * sp, 0.55 + Math.random() * 0.4, 0.9 * (radius / 8 + 0.4), 0.2, 1, 0.5 + Math.random() * 0.3, 0.15, 0.9, 6, 1.5);
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, sp = (1 + Math.random() * 4) * (radius / 8 + 0.4);
      this.smoke.emit(pos.x, pos.y + 0.6, pos.z, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 2.5 + Math.random() * 2, 1.2, 6 * (radius / 8 + 0.4), 0.18, 0.17, 0.16, 0.5, -1, 0.9);
    }
    this.flashLight.position.copy(pos).add(new THREE.Vector3(0, 2, 0));
    this.flashLight.intensity = 14;
    this.flashT = 0.12;
    const dist = pos.distanceTo(this.camera.position);
    this.audio.explosion(clamp(1 - dist / 500, 0, 1));
    this.shake = Math.max(this.shake, clamp(1 - dist / 80, 0, 1) * 0.9);
    if (owner === "player") {
      for (const m of this.mobs) {
        if (m.dead || m.faction === "ally") continue;
        const d = m.pos.distanceTo(pos);
        if (d < radius) damageMob(this, m, dmg * (1 - (d / radius) * 0.7), false, "player");
      }
      for (const t of this.towers) if (!t.dead && t.pos.distanceTo(pos) < radius + 3) damageTower(this, t, dmg * 0.9, "player");
      for (const s of this.eships) if (!s.dead && s.pos.distanceTo(pos) < radius + 12) damageEShip(this, s, dmg, "player");
    } else {
      const p = this.player;
      if (p.mode !== "ship") {
        const d = p.pos.distanceTo(pos);
        if (d < radius) this.hurtPlayer(dmg * (1 - d / radius * 0.6));
      }
      if (this.ship.pos.distanceTo(pos) < radius + 14) this.hurtShip(dmg * 0.7);
      for (const m of this.mobs) if (m.faction === "ally" && !m.dead && m.pos.distanceTo(pos) < radius) damageMob(this, m, dmg * 0.6, false, "blast");
    }
  }

  hurtPlayer(d: number) {
    const p = this.player;
    const dmg = d * (1 - this.armorReduction);
    p.hp -= dmg;
    p.lastHurt = this.time;
    this.hitFlash = Math.min(1, this.hitFlash + 0.35);
    this.audio.hurt();
    this.shake = Math.max(this.shake, 0.25);
    if (p.hp < p.maxHp * 0.3 && Math.random() < 0.25) this.sayRandom(LINES.lowhp, "askar");
    else if (Math.random() < 0.08) this.sayRandom(LINES.hurt, "askar");
    if (p.hp <= 0) this.die();
  }
  hurtShip(d: number) {
    this.ship.hp -= d;
    this.audio.hit();
    this.shake = Math.max(this.shake, 0.3);
    if (this.player.mode === "ship") this.hitFlash = Math.min(1, this.hitFlash + 0.12);
    if (this.ship.hp <= 0) {
      this.notify("Kemangiz cho'kdi! Tilla jarimasi: 10%");
      this.save.gold = Math.floor(this.save.gold * 0.9);
      this.ship.hp = this.ship.maxHp;
      this.ship.speed = 0;
      this.ship.throttle = 0;
    }
  }
  die() {
    const p = this.player;
    this.notify("Siz yarador bo'ldingiz — tilla jarimasi 15%");
    this.save.gold = Math.floor(this.save.gold * 0.85);
    p.hp = p.maxHp;
    this.dismount(false);
    this.boardShip(true);
    this.ship.hp = Math.max(this.ship.hp, this.ship.maxHp * 0.5);
    this.say("Kapitan, sizni kemaga olib chiqdik. Tuzalishingiz kerak.", "askar", true);
  }

  /* ---------------------------------------------------- board/disembark/etc */
  toggleBoard() {
    if (this.player.mode === "ship") this.disembark();
    else this.boardShip(false);
  }
  boardShip(force: boolean) {
    const p = this.player;
    const d = Math.hypot(p.pos.x - this.ship.pos.x, p.pos.z - this.ship.pos.z);
    if (!force && d > 48) { this.notify("Kema uzoqda — [T] bilan kemaga qaytish"); return; }
    if (p.mode === "horse") this.dismount(true);
    p.mode = "ship";
    setSoldiersOnDeck(this, true);
    this.syncPlayerToShip();
    p.yaw = this.ship.yaw + Math.PI * 0 + 0;
    this.sayRandom(LINES.board, "kapitan");
  }
  disembark() {
    const s = this.ship;
    let best: { x: number; z: number; d: number } | null = null;
    for (let r = 10; r <= 90; r += 8) {
      for (let a = 0; a < 28; a++) {
        const ang = (a / 28) * Math.PI * 2;
        const x = s.pos.x + Math.cos(ang) * r;
        const z = s.pos.z + Math.sin(ang) * r;
        const h = this.world.groundHeight(x, z);
        if (h > 0.9 && h < 7 && this.world.slopeAt(x, z) < 0.55) {
          if (!best || r < best.d) best = { x, z, d: r };
        }
      }
      if (best) break;
    }
    if (!best) { this.notify("Qirg'oq topilmadi — kemani sohilga yaqinlashtiring"); return; }
    const p = this.player;
    p.mode = "foot";
    p.pos.set(best.x, this.world.groundHeight(best.x, best.z), best.z);
    p.vel.set(0, 0, 0);
    this.ship.throttle = 0;
    setSoldiersOnDeck(this, false);
    this.sayRandom(LINES.land, "kapitan");
    this.notify("Qirg'oqqa tushdingiz. [H] — ot, [T] — kemaga qaytish");
  }
  teleportToShip() {
    if (this.player.mode === "ship") return;
    this.dismount(true);
    this.boardShip(true);
    this.notify("Kemaga qaytdingiz");
  }
  toggleHorse() {
    const p = this.player;
    if (p.mode === "ship") return;
    if (p.mode === "horse") { this.dismount(false); return; }
    const hs = this.horse;
    if (this.world.landIslandAt(p.pos.x, p.pos.z) < 0) { this.notify("Ot faqat quruqlikda"); return; }
    if (!hs.spawned || hs.pos.distanceTo(p.pos) > 12) {
      const a = p.yaw - Math.PI / 2;
      const x = p.pos.x + Math.sin(a) * 3;
      const z = p.pos.z + Math.cos(a) * 3;
      hs.pos.set(x, this.world.groundHeight(x, z), z);
      for (let i = 0; i < 10; i++) this.smoke.emit(x, hs.pos.y + 0.2, z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 1, 0.3, 1.3, 0.7, 0.62, 0.5, 0.4, 0, 1);
    }
    hs.spawned = true;
    hs.q!.group.visible = true;
    p.mode = "horse";
    p.pos.copy(hs.pos);
    this.sayRandom(LINES.horse, "kapitan");
  }
  dismount(silent: boolean) {
    const p = this.player;
    if (p.mode !== "horse") return;
    p.mode = "foot";
    this.horse.pos.copy(p.pos);
    this.horse.speed = 0;
    if (!silent) this.notify("Otdan tushdingiz. [H] — yana minish");
  }

  /* ---------------------------------------------------------------- update */
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    if (this.started && !this.paused) this.update(dt);
    else if (!this.started) this.idleUpdate(dt);
    this.renderFrame();
  };

  private renderFrame() {
    const h = this.renderer.domElement.height;
    const fov = this.camera.fov;
    pointScale.value = h / (2 * Math.tan((fov * Math.PI) / 360));
    this.renderer.render(this.scene, this.camera);
  }

  /** title screen: slow orbit around the ship */
  private idleUpdate(dt: number) {
    this.time += dt;
    windU.uTime.value = this.time;
    const t = this.time * 0.08;
    const c = this.ship.pos;
    this.updateShipTransform(dt);
    this.camera.position.set(c.x + Math.cos(t) * 60, 14 + Math.sin(t * 2) * 3, c.z + Math.sin(t) * 60);
    this.camera.lookAt(c.x, 6, c.z);
    this.shipObj.update(this.time, 1);
    this.env.update(dt, this.time, this.camera, this.camera.position, false);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.updateGulls(dt);
    this.shipObj.group.updateMatrixWorld(true);
  }

  private update(dt: number) {
    this.time += dt;
    const t = this.time;
    windU.uTime.value = t;
    const p = this.player;
    this.ship.cd = Math.max(0, this.ship.cd - dt);

    // input -> movement
    if (p.mode === "ship") this.updateShipControl(dt);
    else this.updateFoot(dt);
    this.updateShipTransform(dt);
    if (p.mode === "ship") this.syncPlayerToShip();

    // camera
    this.updateCamera(dt);

    // weapons
    const w = this.weapon;
    w.cd = Math.max(0, w.cd - dt);
    if (w.reloadT > 0) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) w.ammo[w.cur] = this.magSize(w.cur);
    }
    if (p.mode !== "ship" && this.mouseDown && this.locked) {
      if (WEAPONS[w.cur].auto || w.cd <= 0) {
        if (WEAPONS[w.cur].auto || !this.fireLatch) { this.shoot(); this.fireLatch = true; }
      }
    }
    if (!this.mouseDown) this.fireLatch = false;
    this.updateViewModel(dt);

    // cannon queue
    for (let i = this.cannonQueue.length - 1; i >= 0; i--) {
      const q = this.cannonQueue[i];
      if (this.time >= q.t) {
        this.cannonQueue.splice(i, 1);
        this.fireOneCannon(q.idx, q.dir);
      }
    }

    // regen
    if (t - p.lastHurt > 7 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 2.5);

    manageIslands(this, dt);
    updateMobs(this, dt);
    updateTowers(this, dt);
    updateEnemyShips(this, dt);
    updateMissions(this, dt);
    this.updateProjectiles(dt);
    this.mp.update(dt);
    this.updateHorse(dt);
    this.updateAmbient(dt);
    this.updateFx(dt);

    // interact
    this.interactT -= dt;
    if (this.interactT <= 0) {
      this.interactT = 0.12;
      this.interact = p.mode === "ship" ? null : getInteractable(this);
    }

    // timers
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);
    this.hitMark = Math.max(0, this.hitMark - dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
    this.cleanupMobs();

    if (t - this.lastSave > 15) { this.lastSave = t; this.persist(); }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.onHud?.(this.buildHud());
    }
  }

  fireLatch = false;

  private fireOneCannon(idx: number, dir: THREE.Vector3) {
    const c = this.shipObj.cannons[idx];
    if (!c) return;
    const pos = c.getWorldPosition(new THREE.Vector3());
    const side = idx >= 5 ? 1 : -1;
    const out = new THREE.Vector3(Math.cos(this.ship.yaw) * side, 0, -Math.sin(this.ship.yaw) * side);
    pos.addScaledVector(out, 1.4);
    const v = dir.clone();
    v.x += (Math.random() - 0.5) * 0.04;
    v.y += (Math.random() - 0.5) * 0.03;
    v.z += (Math.random() - 0.5) * 0.04;
    v.normalize().multiplyScalar(105);
    const fwd = new THREE.Vector3(Math.sin(this.ship.yaw), 0, Math.cos(this.ship.yaw)).multiplyScalar(this.ship.speed);
    v.add(fwd);
    this.spawnProjectile(pos, v, "player", this.cannonDmg, 7, 7, 0.35);
    this.audio.shot("cannon", 1);
    for (let i = 0; i < 12; i++) {
      this.smoke.emit(pos.x, pos.y, pos.z, out.x * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2, Math.random() * 2, out.z * (2 + Math.random() * 4) + (Math.random() - 0.5) * 2, 2.2, 0.6, 3.2, 0.8, 0.8, 0.8, 0.5, -0.2, 0.8);
    }
    this.glow.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, 2.2, 0.4, 1, 0.7, 0.3, 0.9);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 12;
    this.flashT = 0.09;
    this.shake = Math.max(this.shake, 0.35);
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.vel.y -= 22 * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      this.smoke.emit(pr.pos.x, pr.pos.y, pr.pos.z, 0, 0, 0, 0.8, 0.2, 0.7, 0.7, 0.7, 0.7, 0.25, 0, 1);
      let boom = false;
      let water = false;
      const gy = this.world.groundHeight(pr.pos.x, pr.pos.z);
      if (pr.life <= 0) boom = true;
      else if (pr.pos.y < Math.max(gy, 0) ) {
        if (gy > 0) boom = true; else water = true;
      } else if (pr.owner === "player") {
        for (const s of this.eships) if (!s.dead && Math.abs(pr.pos.x - s.pos.x) < 14 && Math.abs(pr.pos.z - s.pos.z) < 14 && pr.pos.y < 14) { boom = true; break; }
        if (!boom) for (const m of this.mobs) if (!m.dead && m.faction !== "ally" && Math.abs(m.pos.x - pr.pos.x) < 1 && Math.abs(m.pos.z - pr.pos.z) < 1 && pr.pos.y < m.pos.y + m.h) { boom = true; break; }
        if (!boom) for (const tw of this.towers) if (!tw.dead && Math.hypot(tw.pos.x - pr.pos.x, tw.pos.z - pr.pos.z) < 3.4 && pr.pos.y < tw.pos.y + tw.h) { boom = true; break; }
      } else {
        if (Math.abs(pr.pos.x - this.ship.pos.x) < 13 && Math.abs(pr.pos.z - this.ship.pos.z) < 13 && pr.pos.y < 8 && pr.pos.y > -1) boom = true;
        else if (this.player.mode !== "ship" && pr.pos.distanceTo(this.player.pos) < 2) boom = true;
      }
      if (water) {
        this.splash(pr.pos, 1.6);
        this.removeProjectile(i);
      } else if (boom) {
        this.explode(pr.pos, pr.splash, pr.dmg, pr.owner);
        this.removeProjectile(i);
      }
    }
  }
  private removeProjectile(i: number) {
    const pr = this.projectiles[i];
    this.scene.remove(pr.mesh);
    pr.mesh.geometry.dispose();
    (pr.mesh.material as THREE.Material).dispose();
    this.projectiles.splice(i, 1);
  }

  private cleanupMobs() {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead && m.deadT > 8) {
        m.group.parent?.remove(m.group);
        this.mobs.splice(i, 1);
      }
    }
  }

  /* ---------------------------------------------------------- foot / horse */
  private surfaceAt(x: number, z: number, h: number): Surface {
    const isl = this.world.landIslandAt(x, z);
    if (isl < 0) return "sand";
    const b = this.world.islands[isl].biome;
    if (h < 1.6) return "sand";
    if (b.snowLine < 900 && h > b.snowLine) return "snow";
    if (b.key === "canyon" || b.key === "volcano" || b.key === "ash") return "rock";
    if (b.key === "desert") return "sand";
    return "grass";
  }

  private updateFoot(dt: number) {
    const p = this.player;
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const f = k("KeyW") - k("KeyS");
    const r = k("KeyD") - k("KeyA");
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    let mx = sin * f - cos * r;
    let mz = cos * f + sin * r;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const mounted = p.mode === "horse";
    let spd = (mounted ? 12.5 : 5.2) * (1 + 0.05 * this.save.speedLvl);
    if ((this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && f > 0) spd *= mounted ? 1.45 : 1.6;
    const ground = this.world.groundHeight(p.pos.x, p.pos.z);
    const wading = ground < -0.25;
    if (wading) spd *= mounted ? 0.7 : 0.55;
    if (this.aiming) spd *= 0.6;
    const acc = p.onGround ? 14 : 2.5;
    p.vel.x += (mx * spd - p.vel.x) * Math.min(1, acc * dt);
    p.vel.z += (mz * spd - p.vel.z) * Math.min(1, acc * dt);
    if (this.keys.has("Space") && p.onGround) { p.vel.y = mounted ? 6.8 : 7.4; p.onGround = false; }
    p.vel.y -= 24 * dt;
    let nx = p.pos.x + p.vel.x * dt;
    let nz = p.pos.z + p.vel.z * dt;
    const ng = this.world.groundHeight(nx, nz);
    if (ng < -1.35) {
      const gx = this.world.groundHeight(nx, p.pos.z);
      const gz = this.world.groundHeight(p.pos.x, nz);
      nx = gx >= -1.35 ? nx : p.pos.x;
      nz = gz >= -1.35 ? nz : p.pos.z;
    }
    if (p.onGround && this.world.groundHeight(nx, nz) - p.pos.y > 1.15) { nx = p.pos.x; nz = p.pos.z; p.vel.x = 0; p.vel.z = 0; }
    [nx, nz] = this.world.collide(nx, nz, mounted ? 0.8 : 0.45);
    p.pos.x = nx;
    p.pos.z = nz;
    p.pos.y += p.vel.y * dt;
    const gy = this.world.groundHeight(nx, nz);
    if (p.pos.y <= gy) {
      p.pos.y = gy;
      if (p.vel.y < -6) this.shake = Math.max(this.shake, 0.15);
      p.vel.y = Math.max(0, p.vel.y);
      p.onGround = true;
    } else if (p.onGround && p.pos.y - gy < 0.5 && p.vel.y <= 0) {
      p.pos.y = gy;
    } else if (p.pos.y - gy > 0.08) p.onGround = false;

    const hs = Math.hypot(p.vel.x, p.vel.z);
    p.speed = hs;
    if (p.onGround && hs > 0.6) {
      p.stepAcc += hs * dt;
      p.bob += hs * dt * (mounted ? 1.2 : 1.7);
      const stride = mounted ? 3.0 : 2.4;
      if (p.stepAcc > stride) {
        p.stepAcc = 0;
        if (wading) {
          this.splash(p.pos, 0.15);
        } else {
          const sf = this.surfaceAt(p.pos.x, p.pos.z, gy);
          if (mounted) this.audio.hoof(1); else this.audio.step(sf, hs > 7 ? 1.4 : 1);
          const col = sf === "snow" ? [0.95, 0.97, 1] : sf === "sand" ? [0.85, 0.74, 0.5] : [0.5, 0.45, 0.35];
          for (let i = 0; i < 3; i++) this.smoke.emit(p.pos.x, gy + 0.05, p.pos.z, (Math.random() - 0.5) * 1.2, 0.5 + Math.random(), (Math.random() - 0.5) * 1.2, 0.8, 0.08, 0.4, col[0], col[1], col[2], 0.35, 1.5, 1);
        }
      }
    }
    // horse follows
    if (mounted) {
      const hs2 = this.horse;
      hs2.pos.copy(p.pos);
      if (hs > 0.5) {
        let dy = Math.atan2(p.vel.x, p.vel.z) - hs2.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        hs2.yaw += dy * Math.min(1, dt * 6);
      }
      hs2.speed = hs;
    }
  }

  private updateHorse(dt: number) {
    const hs = this.horse;
    if (!hs.q || !hs.spawned) return;
    const g = hs.q.group;
    if (this.player.mode === "ship") { g.visible = false; return; }
    g.visible = true;
    g.position.copy(hs.pos);
    g.rotation.y = hs.yaw;
    if (this.player.mode !== "horse") hs.speed = 0;
    hs.q.update(hs.speed, dt);
    if (this.player.mode === "horse" && hs.speed > 8) {
      hs.breathT -= dt;
      if (hs.breathT < 0) {
        hs.breathT = 0.16;
        this.smoke.emit(hs.pos.x - Math.sin(hs.yaw) * 1, hs.pos.y + 0.1, hs.pos.z - Math.cos(hs.yaw) * 1, (Math.random() - 0.5), 0.6, (Math.random() - 0.5), 1, 0.2, 1.2, 0.72, 0.62, 0.48, 0.3, 0, 1);
      }
    }
    // cold breath for horse
    if (this.cold()) {
      hs.breathT -= dt;
      if (hs.breathT < 0) {
        hs.breathT = 1.8;
        const fx = Math.sin(hs.yaw), fz = Math.cos(hs.yaw);
        for (let i = 0; i < 4; i++) this.smoke.emit(hs.pos.x + fx * 1.6, hs.pos.y + 1.7, hs.pos.z + fz * 1.6, fx * 1.2 + (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, fz * 1.2 + (Math.random() - 0.5) * 0.3, 1.5, 0.12, 0.9, 1, 1, 1, 0.3, -0.1, 0.8);
      }
    }
  }
  cold() {
    return this.nearR < 1.25 && BIOMES[ISLANDS[this.nearIdx].biome].cold;
  }

  /* ----------------------------------------------------------------- ship */
  private updateShipControl(dt: number) {
    const s = this.ship;
    const k = (c: string) => this.keys.has(c);
    if (k("KeyW")) s.throttle = Math.min(1, s.throttle + dt * 0.55);
    if (k("KeyS")) s.throttle = Math.max(-0.25, s.throttle - dt * 0.8);
    if (k("Space")) s.throttle *= 1 - Math.min(1, dt * 2.5);
    const rud = (k("KeyA") ? 1 : 0) - (k("KeyD") ? 1 : 0);
    s.rudder += (rud - s.rudder) * Math.min(1, dt * 3);
  }

  private updateShipTransform(dt: number) {
    const s = this.ship;
    const t = this.time;
    if (this.player.mode !== "ship") { s.throttle = 0; s.rudder = 0; }
    const target = s.throttle * this.shipMaxSpeed;
    s.speed += (target - s.speed) * Math.min(1, dt * 0.45);
    if (Math.abs(s.speed) < 0.02 && s.throttle === 0) s.speed = 0;
    s.yaw += s.rudder * dt * 0.5 * Math.min(1, Math.abs(s.speed) / 5) * (s.speed >= 0 ? 1 : -1);
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const nx = s.pos.x + fx * s.speed * dt;
    const nz = s.pos.z + fz * s.speed * dt;
    let hit = false;
    for (const off of [17, 9, 0, -9, -15]) {
      for (const side of [-3, 0, 3]) {
        const x = nx + fx * off + Math.cos(s.yaw) * side;
        const z = nz + fz * off - Math.sin(s.yaw) * side;
        if (this.world.groundHeight(x, z) > -2.8) { hit = true; break; }
      }
      if (hit) break;
    }
    if (hit) {
      if (Math.abs(s.speed) > 6) {
        this.hurtShip(Math.abs(s.speed) * 2.5);
        this.shake = Math.max(this.shake, 0.6);
        this.notify("Kema qirg'oqqa urildi!");
      }
      s.speed = -s.speed * 0.3;
      s.throttle = 0;
    } else {
      s.pos.x = nx;
      s.pos.z = nz;
    }
    const hc = waveHeight(s.pos.x, s.pos.z, t);
    const front = waveHeight(s.pos.x + fx * 14, s.pos.z + fz * 14, t);
    const back = waveHeight(s.pos.x - fx * 14, s.pos.z - fz * 14, t);
    const lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw);
    const hl = waveHeight(s.pos.x + lx * 4, s.pos.z + lz * 4, t);
    const hr = waveHeight(s.pos.x - lx * 4, s.pos.z - lz * 4, t);
    const g = this.shipObj.group;
    g.position.set(s.pos.x, hc * 0.85 - 0.15, s.pos.z);
    g.rotation.set(-Math.atan2(front - back, 28) * 0.9, s.yaw, Math.atan2(hl - hr, 8) * 0.9 + s.rudder * s.speed * 0.003, "YXZ");
    this.shipObj.update(t, 0.7 + Math.min(1.4, Math.abs(s.speed) / 12) + (this.weatherAmt > 0.5 ? 0.3 : 0));
    // wake
    s.wake -= dt;
    if (Math.abs(s.speed) > 2 && s.wake <= 0) {
      s.wake = 0.045;
      const sp = Math.abs(s.speed);
      for (const sd of [-1, 1]) {
        const bx = s.pos.x + fx * 15 + lx * sd * 1.6;
        const bz = s.pos.z + fz * 15 + lz * sd * 1.6;
        this.smoke.emit(bx, 0.3, bz, lx * sd * (1 + sp * 0.08) + fx * sp * 0.2, 0.9 + sp * 0.05, lz * sd * (1 + sp * 0.08) + fz * sp * 0.2, 1.2, 0.3, 1.1, 0.95, 0.98, 1, 0.5, 4, 1);
      }
      const sx = s.pos.x - fx * 15, sz = s.pos.z - fz * 15;
      this.smoke.emit(sx + (Math.random() - 0.5) * 3, 0.15, sz + (Math.random() - 0.5) * 3, 0, 0.1, 0, 3.2, 1.2, 3.8, 0.92, 0.97, 1, 0.38, 0, 0.3);
      this.smoke.emit(sx + (Math.random() - 0.5) * 6, 0.15, sz + (Math.random() - 0.5) * 6, 0, 0.1, 0, 4, 1, 3.4, 0.92, 0.97, 1, 0.26, 0, 0.3);
    }
    if (this.shipObj.lantern) this.shipObj.lantern.intensity = (1 - this.env.daylight) * 30;
    g.updateMatrixWorld(true);
  }

  private syncPlayerToShip() {
    const w = this.shipObj.group.localToWorld(this.shipObj.helm.clone());
    this.player.pos.set(w.x, w.y - 1.7, w.z);
    this.player.vel.set(0, 0, 0);
    this.player.onGround = true;
    this.player.speed = 0;
  }

  /* ---------------------------------------------------------------- camera */
  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    const eye = p.mode === "horse" ? 2.55 : 1.68;
    let y = p.pos.y + (p.mode === "ship" ? 1.7 : eye);
    if (p.mode !== "ship") y += Math.sin(p.bob * 2) * 0.035 * Math.min(1, p.speed / 5);
    cam.position.set(p.pos.x, y, p.pos.z);
    if (p.mode === "ship") cam.position.set(p.pos.x, p.pos.y + 1.7, p.pos.z);
    const sh = this.shake;
    const sx = (Math.random() - 0.5) * sh * 0.05;
    const sy = (Math.random() - 0.5) * sh * 0.05;
    cam.rotation.set(clamp(p.pitch, -1.5, 1.5) + sy, p.yaw + Math.PI + sx, 0, "YXZ");
    const zoom = this.aiming ? WEAPONS[this.weapon.cur].zoom : 1;
    const tf = 72 / zoom;
    cam.fov += (tf - cam.fov) * Math.min(1, dt * 12);
    cam.updateProjectionMatrix();
    this.underwater = cam.position.y < waveHeight(cam.position.x, cam.position.z, this.time) - 0.1;
    cam.updateMatrixWorld(true);
  }

  private updateViewModel(dt: number) {
    const vm = this.vm;
    const p = this.player;
    this.vmKick = Math.max(0, this.vmKick - dt * 9);
    const aim = this.aiming ? 1 : 0;
    const tx = lerp(0.2, 0.0, aim);
    const ty = lerp(-0.2, -0.13, aim);
    const bobx = Math.sin(p.bob) * 0.008 * Math.min(1, p.speed / 5);
    const boby = Math.abs(Math.cos(p.bob)) * 0.01 * Math.min(1, p.speed / 5);
    this.mdx *= 0.8;
    this.mdy *= 0.8;
    vm.position.x += (tx + bobx - this.mdx * 0.0007 - vm.position.x) * Math.min(1, dt * 12);
    vm.position.y += (ty + boby + this.mdy * 0.0006 - vm.position.y) * Math.min(1, dt * 12);
    const w = this.weapon;
    const rl = w.reloadT > 0 ? Math.sin(clamp(1 - w.reloadT / WEAPONS[w.cur].reload, 0, 1) * Math.PI) : 0;
    this.vmReload = rl;
    vm.position.z = -0.42 + this.vmKick * 0.07 + rl * 0.05;
    vm.rotation.x = this.vmKick * 0.09 - rl * 0.9;
    vm.rotation.z = rl * 0.3;
    vm.visible = p.mode !== "ship";
  }

  /* --------------------------------------------------------------- ambient */
  private updateGulls(dt: number) {
    const c = this.camera.position;
    const vis = this.env.daylight > 0.15;
    for (const b of this.gulls) {
      b.g.visible = vis;
      if (!vis) continue;
      b.ang += b.spd * dt;
      const x = c.x + Math.cos(b.ang) * b.rad;
      const z = c.z + Math.sin(b.ang) * b.rad;
      const y = Math.max(8, c.y) + b.alt + Math.sin(this.time * 0.3 + b.ph) * 4;
      b.g.position.set(x, y, z);
      b.g.rotation.y = -b.ang;
      b.g.rotation.z = -0.25;
      const fl = Math.sin(this.time * 3.5 + b.ph) * 0.45;
      b.wl.rotation.z = fl;
      b.wr.rotation.z = -fl;
    }
  }

  private updateAmbient(dt: number) {
    const p = this.player;
    const c = this.camera.position;
    this.updateGulls(dt);
    // nearest island / biome
    let bi = 0, br = 99;
    for (let i = 0; i < ISLANDS.length; i++) {
      const d = ISLANDS[i];
      const r = Math.hypot((c.x - d.cx) / ISLAND_A, (c.z - d.cz) / ISLAND_B);
      if (r < br) { br = r; bi = i; }
    }
    this.nearIdx = bi;
    this.nearR = br;
    const biome = BIOMES[ISLANDS[bi].biome];
    this.curIsland = br < 1.5 ? bi : -1;

    // weather
    const wt = biome.weather;
    if (this.weather.type !== wt && this.weather.amt < 0.05) this.weather.setType(wt);
    const target = this.weather.type === wt ? biome.weatherAmt * (1 - smoothstep(0.95, 1.5, br)) : 0;
    this.weather.update(this.time, c, target, dt);
    this.weatherAmt = this.weather.amt;
    this.env.fogExtra = (this.weather.type === "rain" || this.weather.type === "snow" ? 0.00045 : this.weather.type === "ash" || this.weather.type === "sand" ? 0.0003 : 0) * this.weather.amt;
    windU.uWind.value = 1 + (this.weather.type === "sand" ? 0.8 : 0) * this.weather.amt + (this.weather.type === "rain" ? 0.4 : 0) * this.weather.amt + Math.min(0.5, Math.abs(this.ship.speed) * 0.01);

    // fireflies
    const ffOn = this.env.daylight < 0.4 && br < 0.95 && !["arctic", "desert", "volcano", "ash", "canyon"].includes(biome.key) ? 1 : 0;
    this.fireflies.update(this.time, c, ffOn * 0.9, dt);

    // grass
    this.grass.update(p.mode === "ship" ? c.x : p.pos.x, p.mode === "ship" ? c.z : p.pos.z, this.world);
    this.grass.mesh.visible = p.mode !== "ship" || br < 1.05;

    // ocean/wind ambience
    const gh = this.world.groundHeight(c.x, c.z);
    const nearWater = gh < 0 ? 1 : clamp(1 - Math.min(...[0, 1, 2, 3].map((i) => this.world.groundHeight(c.x + Math.cos(i * 1.57) * 60, c.z + Math.sin(i * 1.57) * 60) > 0 ? 1 : 0)) * 0.0, 0.25, 1) * clamp(1 - gh / 30, 0.2, 1);
    this.audio.setAmbience(gh < 0.5 ? 1 : nearWater * 0.7, 0.25 + Math.min(1, windU.uWind.value - 0.8) * 0.5 + (this.weather.type === "sand" || this.weather.type === "snow" ? 0.3 : 0));

    // breath steam in the cold
    if (this.cold() && p.mode !== "ship") {
      p.breathT -= dt;
      if (p.breathT < 0) {
        p.breathT = 2.6;
        this.breathBurst();
      }
    }
    // cold: NPC/ally breath handled in mobs.ts
    // butterflies
    const bflyOn = this.env.daylight > 0.35 && br < 1 && ["tropical", "jungle", "sakura", "savanna", "autumn", "atoll"].includes(biome.key) && p.mode !== "ship";
    for (const b of this.butterflies) {
      b.g.visible = bflyOn;
      if (!bflyOn) continue;
      const t = this.time * b.spd;
      const bx = p.pos.x + b.off.x + Math.sin(t * 0.7 + b.ph) * 4;
      const bz = p.pos.z + b.off.z + Math.cos(t * 0.6 + b.ph) * 4;
      const by = this.world.groundHeight(bx, bz) + b.off.y + Math.sin(t * 2 + b.ph) * 0.5;
      b.g.position.set(bx, Math.max(by, 1), bz);
      b.g.rotation.y = t * 0.7 + b.ph;
      const fl = Math.sin(this.time * 18 + b.ph) * 0.9;
      b.wl.rotation.z = fl;
      b.wr.rotation.z = -fl;
    }
    // crabs
    const crabOn = ["tropical", "atoll", "mangrove"].includes(biome.key) && br < 1.1 && p.mode !== "ship";
    for (const cb of this.crabs) {
      cb.g.visible = crabOn;
      if (!crabOn) continue;
      const dx = cb.pos.x - p.pos.x, dz = cb.pos.z - p.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 50) {
        const a = Math.random() * 6.28, r = 8 + Math.random() * 30;
        const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
        const h = this.world.groundHeight(x, z);
        if (h > 0.3 && h < 2.2) cb.pos.set(x, h, z);
        else cb.pos.set(1e6, 0, 1e6);
      }
      if (dd < 6) cb.flee = 1.5;
      if (cb.flee > 0) {
        cb.flee -= dt;
        const a = Math.atan2(dz, dx);
        const nx = cb.pos.x + Math.cos(a) * 3.5 * dt, nz = cb.pos.z + Math.sin(a) * 3.5 * dt;
        const h = this.world.groundHeight(nx, nz);
        if (h > 0.2) { cb.pos.x = nx; cb.pos.z = nz; }
      } else if (Math.random() < dt * 0.6) {
        cb.dir = Math.random() * 6.28;
      } else if (Math.sin(this.time * 2 + cb.ph) > 0.7) {
        const nx = cb.pos.x + Math.cos(cb.dir) * 0.6 * dt, nz = cb.pos.z + Math.sin(cb.dir) * 0.6 * dt;
        if (this.world.groundHeight(nx, nz) > 0.2) { cb.pos.x = nx; cb.pos.z = nz; }
      }
      cb.pos.y = this.world.groundHeight(cb.pos.x, cb.pos.z);
      cb.g.position.copy(cb.pos).setY(cb.pos.y + 0.08);
      cb.g.rotation.y = -cb.dir + Math.sin(this.time * 10 + cb.ph) * 0.1;
    }
    // night remark
    if (this.env.elev < -0.05 && this.time - this.lastBark > 120 && Math.random() < dt * 0.02) {
      this.lastBark = this.time;
      this.sayRandom(LINES.night, "askar");
    }
    if (this.cold() && this.time - this.lastPraise > 90 && Math.random() < dt * 0.05) {
      this.lastPraise = this.time;
      this.sayRandom(LINES.snow, "askar");
    }
    // lava glow pulse
    lavaMat.emissiveIntensity = 0.45 + Math.sin(this.time * 1.7) * 0.15 + Math.sin(this.time * 4.1) * 0.05;
  }

  breathBurst() {
    const cam = this.camera;
    const dir = cam.getWorldDirection(this.tmpV);
    for (let i = 0; i < 6; i++) {
      this.smoke.emit(
        cam.position.x + dir.x * 0.35, cam.position.y - 0.14 + dir.y * 0.3, cam.position.z + dir.z * 0.35,
        dir.x * (0.8 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.25, dir.z * (0.8 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.3,
        1.6, 0.05, 0.55 + Math.random() * 0.2, 1, 1, 1, 0.34, -0.12, 0.9
      );
    }
  }

  private updateFx(dt: number) {
    this.env.update(dt, this.time, this.camera, this.player.mode === "ship" ? this.ship.pos : this.player.pos, this.underwater);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.tracers.update(dt);
    // campfire / island fx handled in islands.ts via rt.fires
    this.shipObj.group.visible = true;
  }

  /* ------------------------------------------------------------------- HUD */
  buildHud(): HudState {
    const p = this.player;
    const w = this.weapon;
    const def = WEAPONS[w.cur];
    const e = this.env;
    const hh = Math.floor(e.dayTime * 24);
    const mm = Math.floor((e.dayTime * 24 - hh) * 60);
    const nowT = this.time;
    const isl = this.curIsland >= 0 ? ISLANDS[this.curIsland] : null;
    const mp = this.mp;
    const roomOwners: Record<number, string> = {};
    mp.owners.forEach((v, k) => { roomOwners[k] = v; });
    return {
      hp: p.hp, maxHp: p.maxHp, armor: this.armorReduction,
      ammo: w.ammo[w.cur] ?? 0, mag: this.magSize(w.cur), reloading: w.reloadT > 0,
      weapon: def.name, weaponId: w.cur, gold: this.save.gold,
      soldiers: this.mobs.filter((m) => m.faction === "ally" && !m.dead).length, cap: soldierCap(this.save),
      mode: p.mode, mission: missionHud(this),
      prompt: this.interact ? this.interact.text : null,
      subtitle: this.subtitle && nowT - this.subtitle.t < 5 ? { role: this.subtitle.role, text: this.subtitle.text } : null,
      notices: this.notices.filter((n) => nowT - n.t < 6).map((n) => n.text),
      island: isl ? isl.name : null, biome: isl ? BIOMES[isl.biome].name : null,
      heading: (((180 - (p.yaw * 180) / Math.PI) % 360) + 360) % 360,
      speed: Math.abs(this.ship.speed) * 1.94, shipHp: this.ship.hp, shipMax: this.ship.maxHp, throttle: this.ship.throttle,
      clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      hit: this.hitFlash, underwater: this.underwater, zoom: this.aiming && def.zoom > 3,
      players: mp.list().map((r) => ({ name: r.name, island: r.island >= 0 ? ISLANDS[r.island].name : "dengizda" })),
      room: mp.room ?? "", connected: mp.connected, captured: this.save.captured,
      playerPos: { x: p.pos.x, z: p.pos.z, yaw: p.yaw }, shipPos: { x: this.ship.pos.x, z: this.ship.pos.z, yaw: this.ship.yaw },
      stance: this.stance, locked: this.locked, chat: mp.chat.slice(-6),
      night: e.daylight < 0.35, cold: this.cold(), fps: this.fps,
      remote: mp.list().map((r) => ({ x: r.x, z: r.z, name: r.name })), roomOwners,
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mp.stop();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("contextmenu", this.onCtx);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { buildHumanoid, mulberry32, SHIP_L, SHIP_W };
