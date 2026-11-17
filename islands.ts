import * as THREE from "three";
import { LINES } from "./audio";
import { BIOMES, ISLANDS, ISLAND_A, ISLAND_B } from "./data";
import {
  buildBeaconTower, buildBeam, buildCage, buildCampfire, buildCannonTower, buildChest, buildCrystalPickup, buildFlagPole, buildHut, buildLighthouse, buildPearl, buildShrine, buildTent, buildTotem,
} from "./entities";
import type { Game } from "./engine";
import { mulberry32 } from "./noise";
import { hireSoldier, removeMob, spawnEnemyShip, spawnMob } from "./mobs";
import type { EShip, HudMission, MItem, Mob, Tower } from "./types";
import { buildIslandVegetation } from "./vegetation";

export interface Interactable {
  text: string;
  act: () => void;
}

const COLORS = [0x2f9bff, 0xff4d4d, 0x4dff88, 0xffd23f, 0xc77dff, 0xff9f1c, 0x00e5ff, 0xff6ec7];
export function ownerColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/* ------------------------------------------------------------ LOD / loading */

let mgrT = 0;
export function manageIslands(g: Game, dt: number) {
  mgrT -= dt;
  if (mgrT > 0) return;
  mgrT = 0.3;
  const c = g.player.mode === "ship" ? g.ship.pos : g.player.pos;
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = g.world.islands[i];
    const rt = g.rt[i];
    const d = Math.hypot(c.x - isl.def.cx, c.z - isl.def.cz);
    isl.group.visible = d < 8000;
    if (d < 1500) {
      if (!isl.hi) {
        const mesh = new THREE.Mesh(isl.buildGeometry(1), g.terrainMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        isl.hi = mesh;
        isl.group.add(mesh);
      }
      isl.hi.visible = true;
      if (isl.lo) isl.lo.visible = false;
    } else {
      if (isl.hi) isl.hi.visible = false;
      if (isl.lo) isl.lo.visible = true;
    }
    if (d < 2000) {
      if (!isl.vegBuilt) buildIslandVegetation(isl);
      isl.vegGroup.visible = true;
    } else if (d > 2500) isl.vegGroup.visible = false;
    if (d < 1100 && !rt.active) activateIsland(g, i);
    else if (d > 2000 && rt.active) deactivateIsland(g, i);
  }
}

/* ------------------------------------------------------------- activation */

function scatter(g: Game, i: number, x: number, z: number, radius: number, rng: () => number) {
  for (let k = 0; k < 14; k++) {
    const a = rng() * 6.28;
    const r = radius * (0.3 + rng() * 0.7);
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (g.world.groundHeight(px, pz) > 1.6) return { x: px, z: pz };
  }
  void i;
  return { x, z };
}

function addObj(g: Game, i: number, o: THREE.Object3D) {
  g.rt[i].objs.push(o);
  g.scene.add(o);
  return o;
}

function plantFlag(g: Game, i: number, owner: string) {
  const rt = g.rt[i];
  if (rt.flagObj) return;
  const isl = g.world.islands[i];
  const rng = mulberry32(isl.def.seed + 777);
  let x = isl.def.cx + ISLAND_A * 0.12, z = isl.def.cz + ISLAND_B * 0.05;
  if (g.world.groundHeight(x, z) < 3) {
    const p = isl.randomLand(rng, { minH: 4, maxSlope: 0.25, spread: 0.5 });
    x = p.x; z = p.z;
  }
  const { group, cloth } = buildFlagPole(ownerColor(owner), 18);
  group.position.set(x, g.world.groundHeight(x, z), z);
  rt.flagObj = addObj(g, i, group);
  rt.flagCloth = cloth;
  rt.cloths.push(cloth);
}

export function activateIsland(g: Game, i: number) {
  const rt = g.rt[i];
  if (rt.active) return;
  rt.active = true;
  const isl = g.world.islands[i];
  const b = isl.biome;
  const rng = mulberry32(isl.def.seed + 99);
  const captured = rt.mission.complete;
  const firstTime = !rt.campsMade;

  if (firstTime) {
    const nCamps = 3 + Math.floor(i / 5);
    for (let k = 0; k < nCamps; k++) {
      const p = isl.randomLand(rng, { minH: 3, maxH: 50, maxSlope: 0.2, spread: 0.8 });
      const n = 3 + Math.floor(i / 4) + Math.floor(rng() * 3);
      rt.camps.push({ x: p.x, z: p.z, n, dead: captured ? n : 0, looted: captured, obj: [], fire: null, chest: null });
    }
    rt.campsMade = true;
  }
  // camps
  rt.camps.forEach((c, ci) => {
    const crng = mulberry32(isl.def.seed + ci * 17);
    const y = g.world.groundHeight(c.x, c.z);
    const fire = buildCampfire();
    fire.position.set(c.x, y, c.z);
    addObj(g, i, fire);
    c.fire = fire;
    rt.fires.push({ pos: new THREE.Vector3(c.x, y + 0.5, c.z), node: fire });
    const nb = 2 + Math.floor(crng() * 2);
    for (let k = 0; k < nb; k++) {
      const a = (k / nb) * 6.28 + crng();
      const r = 7 + crng() * 3;
      const hx = c.x + Math.cos(a) * r, hz = c.z + Math.sin(a) * r;
      const hy = g.world.groundHeight(hx, hz);
      if (hy < 1.2) continue;
      const obj = k % 2 === 0 ? buildHut(crng) : buildTent(b.key === "desert" || b.key === "canyon" ? 0xd8c08a : 0xb0a078);
      obj.position.set(hx, hy - 0.05, hz);
      obj.rotation.y = Math.atan2(c.x - hx, c.z - hz);
      addObj(g, i, obj);
      if (firstTime) isl.addCollider(hx, hz, 2.5);
    }
    if (!c.looted) {
      const chest = buildChest();
      const cx = c.x + 2.2, cz = c.z - 1.5;
      chest.position.set(cx, g.world.groundHeight(cx, cz), cz);
      chest.rotation.y = crng() * 6;
      addObj(g, i, chest);
      c.chest = chest;
    }
    const alive = Math.max(0, c.n - c.dead);
    for (let k = 0; k < alive; k++) {
      const a = crng() * 6.28 + k;
      const r = 3 + crng() * 6;
      const px = c.x + Math.cos(a) * r, pz = c.z + Math.sin(a) * r;
      const type = i >= 3 && k % 4 === 3 ? "brute" : "raider";
      spawnMob(g, type, px, pz, { island: i, tag: "camp", campIdx: ci });
    }
  });
  // lighthouse on every 3rd island
  if (i % 3 === 0) {
    const lp = isl.randomLand(mulberry32(isl.def.seed + 4), { minH: 2.5, maxH: 6, maxSlope: 0.15, spread: 0.97 });
    const lh = buildLighthouse();
    lh.position.set(lp.x, g.world.groundHeight(lp.x, lp.z) - 0.4, lp.z);
    rt.lighthouse = addObj(g, i, lh);
    if (firstTime) isl.addCollider(lp.x, lp.z, 4.2);
  }
  // lava lake in volcano crater
  if (b.shape === "volcano") {
    const lava = new THREE.Mesh(new THREE.CircleGeometry(52, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a1006, emissive: 0xff4a10, emissiveIntensity: 1.2, roughness: 0.6 }));
    lava.position.set(isl.def.cx, isl.lavaY, isl.def.cz - 40);
    rt.lava = addObj(g, i, lava) as THREE.Mesh;
  }
  // flag
  if (captured || g.mp.owners.has(i)) plantFlag(g, i, g.mp.owners.get(i) ?? g.save.name);
  // wild animals
  if (!rt.animalsSpawned) {
    rt.animalsSpawned = true;
    const kinds = b.animals;
    for (let k = 0; k < (kinds.length ? 12 : 0); k++) {
      const kind = kinds[k % kinds.length];
      const p = isl.randomLand(rng, { minH: 3, maxH: 60, maxSlope: 0.35 });
      if (kind === "wolf") spawnMob(g, "wolf", p.x, p.z, { island: i, tag: "ambient" });
      else spawnMob(g, "animal", p.x, p.z, { island: i, tag: "ambient", animal: kind });
    }
  }
  if (!captured) setupMission(g, i);
}

export function deactivateIsland(g: Game, i: number) {
  const rt = g.rt[i];
  rt.active = false;
  for (const o of rt.objs) o.parent?.remove(o);
  rt.objs = [];
  rt.fires = [];
  rt.cloths = [];
  rt.flagObj = null;
  rt.flagCloth = null;
  rt.lighthouse = null;
  rt.lava = null;
  for (const c of rt.camps) { c.fire = null; c.chest = null; }
  for (const m of g.mobs.slice()) if (m.island === i && m.faction !== "ally") removeMob(g, m);
  // prisoners (ally faction, caged)
  for (const m of g.mobs.slice()) if (m.island === i && m.caged) removeMob(g, m);
  g.towers = g.towers.filter((t) => {
    if (t.island === i) { t.obj.parent?.remove(t.obj); return false; }
    return true;
  });
  g.eships = g.eships.filter((s) => {
    if (s.island === i && s.mission) { g.scene.remove(s.ship.group); return false; }
    return true;
  });
  const m = rt.mission;
  m.items = [];
  m.eshipsSpawned = false;
  rt.animalsSpawned = false;
}

/* ----------------------------------------------------------------- missions */

function genSpots(g: Game, i: number) {
  const isl = g.world.islands[i];
  const def = isl.def.mission;
  const m = g.rt[i].mission;
  if (m.spots.length) return;
  const rng = mulberry32(isl.def.seed + 5);
  const minSep = def.kind === "checkpoints" ? 150 : 80;
  let count = def.target;
  if (def.kind === "survive" || def.kind === "boss") count = 1;
  if (def.kind === "kill") count = Math.ceil(def.target / 4);
  if (def.kind === "hunt" || def.kind === "ships") count = 0;
  for (let k = 0; k < count; k++) {
    for (let tries = 0; tries < 30; tries++) {
      let p = isl.randomLand(rng, { minH: 3, maxH: def.kind === "destroy" && isl.biome.shape === "volcano" ? 90 : 45, maxSlope: 0.28, spread: def.kind === "collect" && isl.biome.shape === "atoll" ? 0.62 : 0.78 });
      if (def.kind === "boss" && isl.biome.shape === "alpine") {
        const h = isl.heightLocal(isl.peakX, isl.peakZ);
        p = { x: isl.peakX + isl.def.cx, z: isl.peakZ + isl.def.cz, y: h };
      }
      if (def.kind === "boss" && isl.biome.shape === "alpine" || m.spots.every((s) => Math.hypot(s.x - p.x, s.z - p.z) > minSep)) {
        m.spots.push(new THREE.Vector3(p.x, p.y, p.z));
        break;
      }
    }
  }
  m.taken = m.spots.map(() => false);
}

function setupMission(g: Game, i: number) {
  const isl = g.world.islands[i];
  const def = isl.def.mission;
  const rt = g.rt[i];
  const m = rt.mission;
  const rng = mulberry32(isl.def.seed + 55 + m.done);
  genSpots(g, i);
  m.items = [];
  const guard = (p: THREE.Vector3, n: number, tag: "mission" | "ambient" = "ambient") => {
    for (let k = 0; k < n; k++) {
      const q = scatter(g, i, p.x, p.z, 12, rng);
      spawnMob(g, i >= 5 && k === 0 ? "brute" : "raider", q.x, q.z, { island: i, tag });
    }
  };
  switch (def.kind) {
    case "collect": {
      m.spots.forEach((s, k) => {
        if (m.taken[k]) { m.items.push({ pos: s, taken: true, obj: null, beam: null, mob: null, tower: null, lit: false }); return; }
        const obj = isl.biome.key === "atoll" ? buildPearl() : isl.biome.key === "crystal" ? buildCrystalPickup(k % 2 ? 0xa080ff : 0x60e0ff) : buildChest();
        obj.position.set(s.x, g.world.groundHeight(s.x, s.z), s.z);
        addObj(g, i, obj);
        const beam = buildBeam(isl.biome.key === "crystal" ? 0xa080ff : 0xffd860, 100);
        beam.position.set(s.x, g.world.groundHeight(s.x, s.z), s.z);
        addObj(g, i, beam);
        m.items.push({ pos: s, taken: false, obj, beam, mob: null, tower: null, lit: false });
        if (isl.biome.key === "crystal") guard(s, 2);
      });
      break;
    }
    case "activate": {
      m.spots.forEach((s, k) => {
        const shrine = isl.biome.key === "sakura";
        const obj = shrine ? buildShrine() : buildBeaconTower();
        const y = g.world.groundHeight(s.x, s.z);
        obj.position.set(s.x, y, s.z);
        obj.rotation.y = (k * 1.3) % 6;
        addObj(g, i, obj);
        const lit = m.taken[k];
        const it: MItem = { pos: s, taken: lit, obj, beam: null, mob: null, tower: null, lit };
        if (!lit) {
          const beam = buildBeam(0x66ccff, 70, 0.8);
          beam.position.set(s.x, y, s.z);
          addObj(g, i, beam);
          it.beam = beam;
          guard(s, 3);
        } else setLit(obj, true);
        m.items.push(it);
      });
      break;
    }
    case "destroy": {
      m.spots.forEach((s, k) => {
        if (m.taken[k]) { m.items.push({ pos: s, taken: true, obj: null, beam: null, mob: null, tower: null, lit: false }); return; }
        const cannon = isl.biome.shape === "volcano";
        const obj = cannon ? buildCannonTower() : buildTotem();
        const y = g.world.groundHeight(s.x, s.z);
        obj.position.set(s.x, y, s.z);
        addObj(g, i, obj);
        const t: Tower = { kind: cannon ? "cannon" : "totem", pos: new THREE.Vector3(s.x, y, s.z), obj, hp: cannon ? 520 : 380, maxHp: cannon ? 520 : 380, cd: 2 + Math.random() * 2, dead: false, island: i, spot: k, r: cannon ? 3.4 : 1.4, h: cannon ? 11 : 9, deadT: 0 };
        g.towers.push(t);
        isl.addCollider(s.x, s.z, cannon ? 3.2 : 1.3);
        const beam = buildBeam(0xff3a20, 80, 0.9);
        beam.position.set(s.x, y, s.z);
        addObj(g, i, beam);
        m.items.push({ pos: s, taken: false, obj, beam, mob: null, tower: t, lit: false });
        guard(s, cannon ? 2 : 3);
      });
      break;
    }
    case "rescue": {
      m.spots.forEach((s, k) => {
        if (m.taken[k]) { m.items.push({ pos: s, taken: true, obj: null, beam: null, mob: null, tower: null, lit: false }); return; }
        const y = g.world.groundHeight(s.x, s.z);
        const cage = buildCage();
        cage.position.set(s.x, y, s.z);
        addObj(g, i, cage);
        const pr = spawnMob(g, "prisoner", s.x, s.z, { island: i, caged: true, cageIdx: k });
        const beam = buildBeam(0x66ff99, 70, 0.8);
        beam.position.set(s.x, y, s.z);
        addObj(g, i, beam);
        m.items.push({ pos: s, taken: false, obj: cage, beam, mob: pr, tower: null, lit: false });
        guard(s, 3);
        isl.addCollider(s.x, s.z, 1.5);
      });
      break;
    }
    case "checkpoints": {
      m.spots.forEach((s, k) => {
        const y = g.world.groundHeight(s.x, s.z);
        const { group } = buildFlagPole(0xffd23f, 7);
        group.position.set(s.x, y, s.z);
        addObj(g, i, group);
        const beam = buildBeam(0xffe066, 110, 1.4);
        beam.position.set(s.x, y, s.z);
        addObj(g, i, beam);
        beam.visible = k === m.done;
        m.items.push({ pos: s, taken: k < m.done, obj: group, beam, mob: null, tower: null, lit: false });
      });
      if (!m.started) m.timer = def.time ?? 200;
      break;
    }
    case "survive": {
      const s = m.spots[0];
      const y = g.world.groundHeight(s.x, s.z);
      const obj = buildShrine();
      obj.position.set(s.x, y, s.z);
      addObj(g, i, obj);
      const beam = buildBeam(0xaa66ff, 90, 1.6);
      beam.position.set(s.x, y, s.z);
      addObj(g, i, beam);
      m.items.push({ pos: s, taken: false, obj, beam, mob: null, tower: null, lit: false });
      break;
    }
    case "boss": {
      const s = m.spots[0];
      const y = g.world.groundHeight(s.x, s.z);
      const flag = buildFlagPole(0x111111, 12);
      flag.group.position.set(s.x + 6, y, s.z);
      addObj(g, i, flag.group);
      rt.cloths.push(flag.cloth);
      const boss = spawnMob(g, "boss", s.x, s.z, { island: i, tag: "mission", hp: i >= 12 ? 3200 : 1700, scale: i >= 12 ? 1.8 : 1.55 });
      boss.alert = 0;
      const beam = buildBeam(0xff2020, 120, 1.6);
      beam.position.set(s.x, y, s.z);
      addObj(g, i, beam);
      m.items.push({ pos: s, taken: false, obj: null, beam, mob: boss, tower: null, lit: false });
      for (let k = 0; k < (i >= 12 ? 9 : 6); k++) {
        const q = scatter(g, i, s.x, s.z, 18, rng);
        spawnMob(g, k % 3 === 2 ? "brute" : "raider", q.x, q.z, { island: i, tag: "ambient" });
      }
      break;
    }
    case "kill": {
      const need = def.target - m.done;
      let placed = 0;
      for (const s of m.spots) {
        const y = g.world.groundHeight(s.x, s.z);
        const fire = buildCampfire();
        fire.position.set(s.x, y, s.z);
        addObj(g, i, fire);
        rt.fires.push({ pos: new THREE.Vector3(s.x, y + 0.5, s.z), node: fire });
        const beam = buildBeam(0xff5a2a, 60, 0.6);
        beam.position.set(s.x, y, s.z);
        addObj(g, i, beam);
        for (let k = 0; k < 4 && placed < need; k++, placed++) {
          const q = scatter(g, i, s.x, s.z, 10, rng);
          if (isl.biome.key === "tundra" && placed % 2 === 0) spawnMob(g, "wolf", q.x, q.z, { island: i, tag: "mission" });
          else spawnMob(g, i >= 6 && placed % 5 === 4 ? "brute" : "raider", q.x, q.z, { island: i, tag: "mission" });
        }
      }
      break;
    }
    case "hunt": {
      const need = def.target - m.done + 4;
      const kinds = isl.biome.animals.filter((a) => a !== "wolf");
      const use = kinds.length ? kinds : (["deer"] as const);
      for (let k = 0; k < need; k++) {
        const p = isl.randomLand(rng, { minH: 3, maxH: 40, maxSlope: 0.3 });
        spawnMob(g, "animal", p.x, p.z, { island: i, tag: "mission", animal: use[k % use.length] });
      }
      break;
    }
    case "ships": {
      const need = def.target - m.done;
      for (let k = 0; k < need; k++) {
        const es = spawnEnemyShip(g, isl.def.cx + 700, isl.def.cz, { mission: true, island: i });
        es.orbit = (k / Math.max(1, need)) * 6.28 + 0.5;
        const px = isl.def.cx + Math.cos(es.orbit) * 780;
        const pz = isl.def.cz + Math.sin(es.orbit) * 1230;
        es.pos.set(px, 0, pz);
        es.ship.group.position.set(px, 0, pz);
        if (g.world.groundHeight(px, pz) > -4) {
          const q = g.findSeaSpot(isl.def.cx, isl.def.cz, es.orbit);
          es.pos.set(q.x, 0, q.z);
        }
      }
      m.eshipsSpawned = true;
      break;
    }
  }
}

function setLit(obj: THREE.Object3D, lit: boolean) {
  const f = obj.getObjectByName("flame");
  const f2 = obj.getObjectByName("flame2");
  if (f) f.visible = lit;
  if (f2) f2.visible = lit;
  const lamp = obj.getObjectByName("lamp") as THREE.Mesh | undefined;
  if (lamp) (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = lit ? 2.5 : 0.2;
}

export function completeMission(g: Game, i: number) {
  const rt = g.rt[i];
  const m = rt.mission;
  if (m.complete) return;
  m.complete = true;
  const def = ISLANDS[i].mission;
  if (!g.save.captured.includes(i)) g.save.captured.push(i);
  g.addGold(def.reward);
  g.notify(`ORol EGALLANDI: ${ISLANDS[i].name}  (+${def.reward} tilla)`);
  g.sayRandom(LINES.captured, "kapitan", true);
  g.audio.success();
  plantFlag(g, i, g.save.name);
  for (const it of m.items) it.beam?.parent?.remove(it.beam);
  const c = g.player.pos.clone();
  for (let b = 0; b < 4; b++) {
    setTimeout(() => {
      const col = [[1, 0.4, 0.3], [0.4, 0.8, 1], [1, 0.9, 0.3], [0.6, 1, 0.5]][b];
      const ox = (Math.random() - 0.5) * 30, oz = (Math.random() - 0.5) * 30;
      for (let k = 0; k < 90; k++) {
        const a = Math.random() * 6.28, e = Math.acos(Math.random() * 2 - 1), s = 14 + Math.random() * 10;
        g.glow.emit(c.x + ox, c.y + 45, c.z + oz, Math.sin(e) * Math.cos(a) * s, Math.cos(e) * s, Math.sin(e) * Math.sin(a) * s, 1.8, 0.8, 0.1, col[0], col[1], col[2], 1, 9, 1.2);
      }
      g.audio.explosion(0.3);
    }, b * 450);
  }
  // clear the remaining camp enemies' hostility on this island: they flee
  g.mp.announceCapture(i);
  g.persist();
}

function checkComplete(g: Game, i: number) {
  const def = ISLANDS[i].mission;
  const m = g.rt[i].mission;
  if (!m.complete && m.done >= def.target) completeMission(g, i);
}

export function onMobKilled(g: Game, m: Mob) {
  if (m.island < 0) return;
  const rt = g.rt[m.island];
  const def = ISLANDS[m.island].mission;
  const ms = rt.mission;
  if (ms.complete) return;
  if (m.campIdx >= 0 && rt.camps[m.campIdx]) rt.camps[m.campIdx].dead++;
  switch (def.kind) {
    case "kill": if (m.tag === "mission" && m.faction === "enemy") ms.done++; break;
    case "boss": if (m.type === "boss") ms.done = 1; break;
    case "hunt": if (m.faction === "wild") ms.done++; break;
    default: break;
  }
  if (def.kind === "kill" || def.kind === "hunt") g.notify(`${def.title}: ${Math.min(ms.done, def.target)}/${def.target}`);
  checkComplete(g, m.island);
}

export function onShipSunk(g: Game, s: EShip) {
  if (!s.mission || s.island < 0) return;
  const ms = g.rt[s.island].mission;
  if (ms.complete || ISLANDS[s.island].mission.kind !== "ships") return;
  ms.done++;
  g.notify(`Kemalar: ${ms.done}/${ISLANDS[s.island].mission.target}`);
  checkComplete(g, s.island);
}

export function onTowerDestroyed(g: Game, t: Tower) {
  const ms = g.rt[t.island].mission;
  if (ms.complete) return;
  ms.taken[t.spot] = true;
  const it = ms.items[t.spot];
  if (it) { it.taken = true; it.beam?.parent?.remove(it.beam); }
  ms.done++;
  g.notify(`${ISLANDS[t.island].mission.title}: ${ms.done}/${ISLANDS[t.island].mission.target}`);
  checkComplete(g, t.island);
}

/* ------------------------------------------------------------- per frame */

let flagT = 0;
export function updateMissions(g: Game, dt: number) {
  const t = g.time;
  const p = g.player;
  const pp = p.mode === "ship" ? g.ship.pos : p.pos;
  flagT -= dt;
  for (const rt of g.rt) {
    if (!rt.active) continue;
    const isl = g.world.islands[rt.idx];
    const d = Math.hypot(pp.x - isl.def.cx, pp.z - isl.def.cz);
    // fires
    for (const f of rt.fires) {
      const fd = f.pos.distanceTo(g.camera.position);
      if (fd > 160) continue;
      if (f.node) {
        const fl = f.node.getObjectByName("flame");
        const fl2 = f.node.getObjectByName("flame2");
        if (fl) fl.scale.set(0.3 * (1 + Math.sin(t * 13 + f.pos.x) * 0.15), 0.9 * (1 + Math.sin(t * 9 + f.pos.z) * 0.25), 0.3 * (1 + Math.cos(t * 11) * 0.15));
        if (fl2) fl2.scale.set(0.18, 0.7 * (1 + Math.sin(t * 15 + f.pos.x) * 0.3), 0.18);
      }
      if (Math.random() < dt * 9) g.smoke.emit(f.pos.x + (Math.random() - 0.5) * 0.3, f.pos.y + 0.8, f.pos.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4 + 0.5, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4, 3, 0.25, 1.6, 0.25, 0.24, 0.23, 0.32, -0.3, 0.2);
      if (Math.random() < dt * 14) g.glow.emit(f.pos.x, f.pos.y + 0.6, f.pos.z, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 1.1, 0.07, 0.01, 1, 0.55, 0.15, 0.9, -0.5, 0.2);
      if (Math.random() < dt * 22) g.glow.emit(f.pos.x + (Math.random() - 0.5) * 0.3, f.pos.y + 0.3, f.pos.z + (Math.random() - 0.5) * 0.3, 0, 0.8, 0, 0.45, 0.35, 0.05, 1, 0.5, 0.1, 0.5, -1, 0.1);
    }
    if (rt.lighthouse) {
      const beam = rt.lighthouse.getObjectByName("beam");
      if (beam) beam.rotation.y += dt * 0.7;
    }
    if (rt.lava && d < 900) {
      const lv = rt.lava.position;
      if (Math.random() < dt * 5) g.smoke.emit(lv.x + (Math.random() - 0.5) * 50, lv.y + 2, lv.z + (Math.random() - 0.5) * 50, 1 + Math.random() * 2, 6 + Math.random() * 6, 0.5, 9, 8, 38, 0.16, 0.14, 0.13, 0.32, -0.4, 0.15);
      if (Math.random() < dt * 8) g.glow.emit(lv.x + (Math.random() - 0.5) * 50, lv.y + 1, lv.z + (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 3, 10 + Math.random() * 14, (Math.random() - 0.5) * 3, 3, 0.35, 0.05, 1, 0.45, 0.1, 1, 6, 0.1);
    }
    if (rt.flagCloth && d < 500) rt.flagCloth.update(t, 1.2);
    for (const c of rt.cloths) if (c !== rt.flagCloth && d < 600) c.update(t, 1.1);
    // beam/pickup anim
    for (const it of rt.mission.items) {
      if (it.obj && !it.taken && ISLANDS[rt.idx].mission.kind === "collect") {
        it.obj.rotation.y += dt * 1.2;
        it.obj.position.y = g.world.groundHeight(it.pos.x, it.pos.z) + Math.sin(t * 2 + it.pos.x) * 0.12;
      }
      if (it.beam) {
        const mat = (it.beam as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = 0.16 + Math.sin(t * 2.2 + it.pos.x) * 0.06;
      }
    }
    // dead camp fires also keep burning
    if (flagT <= 0 && !rt.flagObj && (rt.mission.complete || g.mp.owners.has(rt.idx))) plantFlag(g, rt.idx, g.mp.owners.get(rt.idx) ?? g.save.name);
  }
  if (flagT <= 0) flagT = 1;

  // mission logic of the island we are on
  const i = g.nearR < 1.4 ? g.nearIdx : -1;
  if (i < 0) return;
  const rt = g.rt[i];
  if (!rt.active || rt.mission.complete) return;
  const def = ISLANDS[i].mission;
  const m = rt.mission;
  const onFoot = p.mode !== "ship";
  switch (def.kind) {
    case "collect": {
      if (!onFoot) break;
      m.items.forEach((it, k) => {
        if (it.taken) return;
        if (Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z) < 3.2) {
          it.taken = true;
          m.taken[k] = true;
          it.obj?.parent?.remove(it.obj);
          it.beam?.parent?.remove(it.beam);
          m.done++;
          const gold = 40 + Math.floor(Math.random() * 60);
          g.addGold(gold, true);
          g.notify(`${def.noun[0].toUpperCase()}${def.noun.slice(1)} topildi ${m.done}/${def.target}  +${gold}`);
          g.audio.pickup();
          for (let q = 0; q < 24; q++) g.glow.emit(it.pos.x, it.pos.y + 1, it.pos.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6, 1, 0.2, 0.02, 1, 0.85, 0.3, 1, 10, 0.5);
          checkComplete(g, i);
        }
      });
      break;
    }
    case "checkpoints": {
      const first = m.items[0];
      if (!m.started && first && onFoot && Math.hypot(p.pos.x - first.pos.x, p.pos.z - first.pos.z) < 30 && m.done === 0) {
        m.started = true;
        m.timer = def.time ?? 200;
        g.notify("Vaqt boshlandi! Belgilarga ketma-ket yeting.");
        g.sayRandom(["Vaqt ketyapti, kapitan! Tezroq!"], "ovchi", true);
      }
      if (m.started) {
        m.timer -= dt;
        const cur = m.items[m.done];
        if (cur && Math.hypot(p.pos.x - cur.pos.x, p.pos.z - cur.pos.z) < 9 && onFoot) {
          cur.taken = true;
          m.done++;
          g.audio.pickup();
          g.notify(`Belgi ${m.done}/${def.target}`);
          if (m.done >= def.target) { checkComplete(g, i); break; }
        }
        if (m.timer <= 0) {
          m.started = false;
          m.done = 0;
          m.items.forEach((it) => (it.taken = false));
          g.notify("Vaqt tugadi! Qaytadan boshlang.");
        }
      }
      m.items.forEach((it, k) => { if (it.beam) it.beam.visible = k === m.done; });
      break;
    }
    case "survive": {
      const s = m.items[0];
      if (!s) break;
      const d = Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z);
      if (!m.started && d < 25 && onFoot) {
        m.started = true;
        m.waveT = 4;
        g.notify("Qurbongohni himoya qiling! Doiradan chiqmang.");
        g.sayRandom(["Ular kelmoqda! Qurbongoh yonida turing!"], "kapitan", true);
      }
      if (m.started) {
        if (d < 48) {
          m.timer += dt;
          m.outside = 0;
        } else {
          m.outside += dt;
          m.warn += dt;
          if (m.warn > 5) { m.warn = 0; g.notify("Qurbongohga qayting!"); }
          if (m.outside > 25) { m.started = false; m.timer = 0; m.done = 0; m.wave = 0; g.notify("Himoya buzildi. Qaytadan boshlang."); }
        }
        m.done = Math.floor(m.timer);
        m.waveT -= dt;
        const alive = g.mobs.filter((q) => q.tag === "wave" && !q.dead).length;
        if (m.waveT <= 0 && alive < 14) {
          m.waveT = 15;
          m.wave++;
          const n = Math.min(10, 2 + m.wave);
          g.notify(`${m.wave}-to'lqin! Dushmanlar yaqinlashmoqda`);
          for (let k = 0; k < n; k++) {
            const a = Math.random() * 6.28;
            const q = scatter(g, i, s.pos.x + Math.cos(a) * 40, s.pos.z + Math.sin(a) * 40, 25, Math.random);
            const mob = spawnMob(g, k % 5 === 4 ? "brute" : "raider", q.x, q.z, { island: i, tag: "wave" });
            mob.alert = 30;
          }
          g.sayRandom(LINES.enemy, "askar", true);
        }
        if (m.timer >= def.target) checkComplete(g, i);
      }
      break;
    }
    case "boss": {
      const it = m.items[0];
      if (it?.mob && !it.mob.dead && !m.bossSpoken && Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z) < 100) {
        m.bossSpoken = true;
        g.sayRandom(LINES.boss, "shoh", true);
        it.mob.alert = 20;
      }
      break;
    }
    default: break;
  }
}

/* ------------------------------------------------------------ interactions */

export function getInteractable(g: Game): Interactable | null {
  const p = g.player;
  let best: Interactable | null = null;
  let bd = 4.2;
  for (const rt of g.rt) {
    if (!rt.active) continue;
    const def = ISLANDS[rt.idx].mission;
    const m = rt.mission;
    if (!m.complete) {
      if (def.kind === "activate") {
        m.items.forEach((it, k) => {
          if (it.taken) return;
          const d = Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z);
          if (d < bd) {
            bd = d;
            best = {
              text: `[E] ${def.noun[0].toUpperCase()}${def.noun.slice(1)}ni yoqish`,
              act: () => {
                if (it.taken) return;
                it.taken = true;
                it.lit = true;
                m.taken[k] = true;
                m.done++;
                if (it.obj) setLit(it.obj, true);
                it.beam?.parent?.remove(it.beam);
                g.audio.pickup();
                g.notify(`${def.title}: ${m.done}/${def.target}`);
                for (let q = 0; q < 30; q++) g.glow.emit(it.pos.x, it.pos.y + 3, it.pos.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 6, (Math.random() - 0.5) * 5, 1.4, 0.3, 0.02, 1, 0.6, 0.2, 1, 6, 0.5);
                checkComplete(g, rt.idx);
              },
            };
          }
        });
      }
      if (def.kind === "rescue") {
        m.items.forEach((it, k) => {
          if (it.taken) return;
          const d = Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z);
          if (d < bd) {
            bd = d;
            best = {
              text: "[E] Asirni ozod qilish",
              act: () => {
                if (it.taken) return;
                it.taken = true;
                m.taken[k] = true;
                m.done++;
                if (it.obj) it.obj.visible = false;
                it.beam?.parent?.remove(it.beam);
                if (it.mob) removeMob(g, it.mob);
                g.save.soldiers++;
                const s = hireSoldier(g, false);
                s.pos.set(it.pos.x + 1.5, it.pos.y, it.pos.z + 1.5);
                g.sayRandom(LINES.rescue, "asir", true);
                g.notify(`Asir ozod qilindi ${m.done}/${def.target} — qo'shiningizga qo'shildi`);
                g.audio.pickup();
                checkComplete(g, rt.idx);
              },
            };
          }
        });
      }
    }
    rt.camps.forEach((c) => {
      if (c.looted || !c.chest) return;
      const d = Math.hypot(p.pos.x - (c.x + 2.2), p.pos.z - (c.z - 1.5));
      if (d < bd) {
        bd = d;
        best = {
          text: "[E] Sandiqni ochish",
          act: () => {
            if (c.looted) return;
            c.looted = true;
            c.chest?.parent?.remove(c.chest);
            const gold = 60 + Math.floor(Math.random() * 120);
            g.addGold(gold);
            for (let i2 = 0; i2 < WEAPON_COUNT; i2++) g.weapon.ammo[i2] = g.magSize(i2);
            g.hpHeal(40);
            g.audio.pickup();
            g.notify("Sandiq: o'q-dorilar to'ldirildi, sog'liq +40");
          },
        };
      }
    });
  }
  return best;
}
const WEAPON_COUNT = 6;

/* ---------------------------------------------------------------- HUD info */

export function missionHud(g: Game): HudMission | null {
  const i = g.nearR < 3.2 ? g.nearIdx : -1;
  if (i < 0) return null;
  const isl = ISLANDS[i];
  const def = isl.mission;
  const m = g.rt[i].mission;
  const p = g.player.mode === "ship" ? g.ship.pos : g.player.pos;
  let tx = isl.cx, tz = isl.cz;
  let bd = Infinity;
  const consider = (x: number, z: number) => {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < bd) { bd = d; tx = x; tz = z; }
  };
  if (!m.complete) {
    switch (def.kind) {
      case "collect": case "activate": case "destroy": case "rescue":
        m.items.forEach((it) => { if (!it.taken) consider(it.pos.x, it.pos.z); });
        break;
      case "checkpoints": { const it = m.items[m.done]; if (it) consider(it.pos.x, it.pos.z); break; }
      case "survive": case "boss": { const it = m.items[0]; if (it) consider(it.pos.x, it.pos.z); break; }
      case "kill": case "hunt":
        for (const mob of g.mobs) if (!mob.dead && mob.island === i && (mob.tag === "mission") ) consider(mob.pos.x, mob.pos.z);
        m.spots.forEach((s) => consider(s.x, s.z));
        break;
      case "ships":
        for (const s of g.eships) if (!s.dead && s.island === i) consider(s.pos.x, s.pos.z);
        break;
    }
  }
  if (!Number.isFinite(bd)) { tx = isl.cx; tz = isl.cz; bd = Math.hypot(tx - p.x, tz - p.z); }
  let rel = Math.atan2(tx - p.x, tz - p.z) - g.player.yaw;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  let timeLeft: number | null = null;
  if (def.kind === "checkpoints" && m.started) timeLeft = Math.max(0, m.timer);
  if (def.kind === "survive" && m.started) timeLeft = Math.max(0, def.target - m.timer);
  return {
    title: def.title, desc: def.desc, progress: Math.min(m.done, def.target), target: def.target, noun: def.noun, island: isl.name,
    dist: bd, bearing: (rel * 180) / Math.PI, timeLeft, complete: m.complete,
  };
}

export { BIOMES };
