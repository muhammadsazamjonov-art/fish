import * as THREE from "three";
import { LINES } from "./audio";
import type { AnimalKind } from "./data";
import { buildHumanoid, buildQuadruped, buildShip, humanoidVariants } from "./entities";
import { waveHeight } from "./environment";
import type { Game } from "./engine";
import { onMobKilled, onShipSunk, onTowerDestroyed } from "./islands";
import { clamp } from "./noise";
import type { EShip, Mob, MobType, Tag, Tower } from "./types";

interface SpawnOpts {
  island?: number;
  tag?: Tag;
  campIdx?: number;
  scale?: number;
  hp?: number;
  animal?: AnimalKind;
  y?: number;
  caged?: boolean;
  cageIdx?: number;
}

const animalStats: Record<AnimalKind, { hp: number; h: number; r: number; scale: number; speed: number }> = {
  deer: { hp: 45, h: 1.7, r: 0.7, scale: 1, speed: 10 },
  zebra: { hp: 60, h: 1.8, r: 0.8, scale: 1, speed: 11 },
  goat: { hp: 35, h: 1.2, r: 0.55, scale: 1, speed: 8 },
  wolf: { hp: 55, h: 1.1, r: 0.6, scale: 1, speed: 8.5 },
};

export function spawnMob(g: Game, type: MobType, x: number, z: number, o: SpawnOpts = {}): Mob {
  const id = g.mobId++;
  const y = o.y ?? g.world.groundHeight(x, z);
  let hum = null as Mob["hum"];
  let quad = null as Mob["quad"];
  let group: THREE.Group;
  let faction: Mob["faction"] = "enemy";
  let hp = 70, speed = 3.6, dmg = 7, range = 30, fireRate = 1.5, h = 1.8, r = 0.5, gold = 30;
  let animal: AnimalKind | null = null;
  const v = humanoidVariants(id * 31 + 7);
  switch (type) {
    case "raider":
      hum = buildHumanoid({ shirt: v.shirt, pants: v.pants, hat: id % 2 ? "bandana" : "pirate", hatColor: id % 2 ? 0x8a1a1a : 0x1a1a1a, gun: true, scale: o.scale ?? 1 + ((id * 7) % 10) * 0.01 });
      gold = 25 + (id % 20);
      break;
    case "brute":
      hum = buildHumanoid({ shirt: 0x3a2a2a, pants: 0x1f1f24, hat: "helmet", gun: true, gunColor: 0x2a2a2a, scale: o.scale ?? 1.22 });
      hp = 210; speed = 3.9; dmg = 16; range = 20; fireRate = 2.2; h = 2.2; r = 0.62; gold = 75;
      break;
    case "boss":
      hum = buildHumanoid({ shirt: 0x7a1010, pants: 0x1a1a1a, hat: "pirate", hatColor: 0x111111, gun: true, gunColor: 0x5a3a10, scale: o.scale ?? 1.55 });
      hp = 1500; speed = 4.2; dmg = 15; range = 48; fireRate = 0.55; h = 2.8; r = 0.8; gold = 700;
      break;
    case "soldier":
      hum = buildHumanoid({ shirt: 0x2a5a8a, pants: 0xdedbd0, hat: "helmet", gun: true, gunColor: 0x4a3018 });
      faction = "ally";
      hp = 95; speed = 5.4; dmg = g.soldierDmg; range = 60; fireRate = 0.85; h = 1.85; r = 0.5; gold = 0;
      break;
    case "prisoner":
      hum = buildHumanoid({ shirt: 0x8a7a5a, pants: 0x5a4a3a, hat: "none", gun: false });
      faction = "ally";
      hp = 80; speed = 0; h = 1.8; gold = 0;
      break;
    case "wolf":
      quad = buildQuadruped("wolf", 1.05);
      hp = 55; speed = 8.5; dmg = 9; range = 2.3; fireRate = 1.1; h = 1.1; r = 0.6; gold = 18; animal = "wolf";
      break;
    case "animal": {
      animal = o.animal ?? "deer";
      const st = animalStats[animal];
      quad = buildQuadruped(animal, st.scale);
      faction = "wild";
      hp = st.hp; speed = st.speed; h = st.h; r = st.r; gold = 12 + (id % 10);
      break;
    }
  }
  group = hum ? hum.group : quad!.group;
  if (o.hp) hp = o.hp;
  group.position.set(x, y, z);
  const yaw = Math.random() * 6.28;
  group.rotation.y = yaw;
  g.scene.add(group);
  const m: Mob = {
    id, type, faction, hum, quad, group, pos: new THREE.Vector3(x, y, z), yaw, hp, maxHp: hp, speed, dmg, range, cd: Math.random() * fireRate, fireRate,
    alert: 0, home: new THREE.Vector3(x, y, z), wanderT: Math.random() * 3, wanderYaw: yaw, island: o.island ?? -1, dead: false, deadT: 0, tag: o.tag ?? null,
    campIdx: o.campIdx ?? -1, h, r, onDeck: false, slot: 0, animal, breathT: Math.random() * 3, curSpeed: 0, gold, fleeT: 0, aiming: false, caged: !!o.caged, cageIdx: o.cageIdx ?? -1,
  };
  g.mobs.push(m);
  return m;
}

export function removeMob(g: Game, m: Mob) {
  m.group.parent?.remove(m.group);
  const i = g.mobs.indexOf(m);
  if (i >= 0) g.mobs.splice(i, 1);
}

export function hasLOS(g: Game, a: THREE.Vector3, b: THREE.Vector3): boolean {
  const d = a.distanceTo(b);
  const n = Math.max(2, Math.ceil(d / 5));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const y = a.y + (b.y - a.y) * t;
    if (g.world.groundHeight(x, z) > y + 0.2) return false;
  }
  return true;
}

function moveMob(g: Game, m: Mob, dx: number, dz: number, speed: number, dt: number, face = true) {
  const l = Math.hypot(dx, dz);
  if (l < 0.001 || speed <= 0) { m.curSpeed = 0; return; }
  dx /= l; dz /= l;
  let nx = m.pos.x + dx * speed * dt;
  let nz = m.pos.z + dz * speed * dt;
  const ng = g.world.groundHeight(nx, nz);
  if (ng < -0.3 || ng - m.pos.y > 1.1) {
    // try sliding
    const gx = g.world.groundHeight(nx, m.pos.z);
    const gz = g.world.groundHeight(m.pos.x, nz);
    if (gx >= -0.3 && gx - m.pos.y < 1.1) nz = m.pos.z;
    else if (gz >= -0.3 && gz - m.pos.y < 1.1) nx = m.pos.x;
    else { nx = m.pos.x; nz = m.pos.z; }
  }
  [nx, nz] = g.world.collide(nx, nz, m.r * 0.8);
  m.pos.x = nx;
  m.pos.z = nz;
  const gy = g.world.groundHeight(nx, nz);
  m.pos.y += (gy - m.pos.y) * Math.min(1, dt * 14);
  m.curSpeed = speed;
  if (face) {
    let dy = Math.atan2(dx, dz) - m.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    m.yaw += dy * Math.min(1, dt * 8);
  }
}

function faceTo(m: Mob, tx: number, tz: number, dt: number, rate = 10) {
  let dy = Math.atan2(tx - m.pos.x, tz - m.pos.z) - m.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  m.yaw += dy * Math.min(1, dt * rate);
}

const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();

function enemyFire(g: Game, m: Mob, target: THREE.Vector3, isPlayer: boolean, ally: Mob | null) {
  const from = tv.set(m.pos.x + Math.sin(m.yaw) * 0.7 * (m.group.scale.x), m.pos.y + m.h * 0.72, m.pos.z + Math.cos(m.yaw) * 0.7 * m.group.scale.x);
  const dist = from.distanceTo(target);
  const chance = clamp(0.8 - dist / (m.range * 1.5), 0.1, 0.78);
  const hit = Math.random() < chance;
  const aim = tv2.copy(target);
  if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4));
  g.tracers.add(from, aim, 1, 0.55, 0.3);
  g.glow.emit(from.x, from.y, from.z, 0, 0, 0, 0.08, 0.5, 0.1, 1, 0.7, 0.3, 0.9);
  const cd = g.camera.position.distanceTo(from);
  g.audio.shot(m.type === "brute" ? "shotgun" : "rifle", clamp(1 - cd / 160, 0, 0.8));
  if (hit) {
    if (isPlayer) g.hurtPlayer(m.dmg);
    else if (ally) damageMob(g, ally, m.dmg, false, "blast");
  } else if (isPlayer && dist < 40 && Math.random() < 0.35) {
    g.audio.hit();
  }
}

function breath(g: Game, m: Mob, dt: number) {
  m.breathT -= dt;
  if (m.breathT > 0) return;
  m.breathT = 2.4 + Math.random();
  const s = m.group.scale.x;
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  for (let i = 0; i < 4; i++) {
    g.smoke.emit(m.pos.x + fx * 0.25 * s, m.pos.y + (m.quad ? m.h * 0.9 : 1.62 * s), m.pos.z + fz * 0.25 * s, fx * 0.7 + (Math.random() - 0.5) * 0.3, 0.25, fz * 0.7 + (Math.random() - 0.5) * 0.3, 1.5, 0.05, 0.5, 1, 1, 1, 0.3, -0.1, 0.9);
  }
}

export function updateMobs(g: Game, dt: number) {
  const p = g.player;
  const t = g.time;
  const cold = g.cold();
  let allyIdx = 0;
  for (const m of g.mobs) {
    const d2 = m.pos.distanceToSquared(p.pos);
    if (m.dead) {
      m.deadT += dt;
      if (m.hum) m.group.rotation.x += (-Math.PI / 2 - m.group.rotation.x) * Math.min(1, dt * 7);
      else m.group.rotation.z += (Math.PI / 2 - m.group.rotation.z) * Math.min(1, dt * 7);
      if (m.deadT > 5) m.group.position.y -= dt * 0.3;
      continue;
    }
    if (m.faction === "ally" && m.type === "soldier") { updateSoldier(g, m, dt, allyIdx++); continue; }
    if (m.type === "prisoner") {
      m.group.position.copy(m.pos);
      m.hum!.update(0, dt, false, t);
      m.group.visible = d2 < 600 * 600;
      continue;
    }
    if (d2 > 330 * 330) { m.group.visible = d2 < 480 * 480; if (d2 > 480 * 480) continue; }
    m.group.visible = true;
    if (m.faction === "enemy") updateEnemy(g, m, dt, d2);
    else updateWild(g, m, dt, d2);
    m.group.position.copy(m.pos);
    m.group.rotation.y = m.yaw;
    if (m.hum) m.hum.update(m.curSpeed, dt, m.aiming, t);
    if (m.quad) m.quad.update(m.curSpeed, dt);
    if (cold && d2 < 60 * 60) breath(g, m, dt);
    if (m.cd > 0) m.cd -= dt;
    if (m.alert > 0) m.alert -= dt;
  }
}

function updateEnemy(g: Game, m: Mob, dt: number, d2p: number) {
  const p = g.player;
  // target selection
  let tgt: THREE.Vector3 | null = null;
  let tAlly: Mob | null = null;
  let best = (m.alert > 0 ? 110 : m.type === "boss" ? 95 : 50) ** 2;
  const eyeOffset = p.mode === "ship" ? 1.7 : 1.3;
  if (d2p < best && (p.mode !== "ship" || d2p < 55 * 55)) {
    tgt = tv2.set(p.pos.x, p.pos.y + eyeOffset, p.pos.z).clone();
    best = d2p;
  }
  for (const a of g.mobs) {
    if (a.faction !== "ally" || a.dead || a.onDeck || a.caged) continue;
    const d = a.pos.distanceToSquared(m.pos);
    if (d < best) { best = d; tgt = new THREE.Vector3(a.pos.x, a.pos.y + 1.2, a.pos.z); tAlly = a; }
  }
  const chaseSpeed = m.speed;
  if (!tgt) {
    m.aiming = false;
    m.wanderT -= dt;
    const hd = Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z);
    if (m.wanderT <= 0) {
      m.wanderT = 2 + Math.random() * 4;
      m.wanderYaw = hd > 18 ? Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z) : Math.random() * 6.28;
      if (Math.random() < 0.4) m.wanderYaw = NaN;
    }
    if (!Number.isNaN(m.wanderYaw)) moveMob(g, m, Math.sin(m.wanderYaw), Math.cos(m.wanderYaw), chaseSpeed * 0.3, dt);
    else m.curSpeed = 0;
    return;
  }
  const dx = tgt.x - m.pos.x, dz = tgt.z - m.pos.z;
  const dist = Math.hypot(dx, dz);
  if (m.fleeT === 0) {
    m.fleeT = 1; // first aggro flag
    if (g.time - g.lastBark > 6 && d2p < 80 * 80) {
      g.lastBark = g.time;
      if (m.type === "boss") g.sayRandom(LINES.boss, "shoh", true);
      else if (Math.random() < 0.5) g.sayRandom(LINES.enemyTalk, "dushman");
      else g.sayRandom(LINES.enemy, "askar");
    }
  }
  m.alert = Math.max(m.alert, 3);
  faceTo(m, tgt.x, tgt.z, dt);
  if (m.type === "wolf") {
    m.aiming = false;
    if (dist > m.range) moveMob(g, m, dx, dz, chaseSpeed, dt);
    else {
      m.curSpeed = 0;
      if (m.cd <= 0) {
        m.cd = m.fireRate;
        if (tAlly) damageMob(g, tAlly, m.dmg, false, "blast");
        else g.hurtPlayer(m.dmg);
      }
    }
    return;
  }
  const want = m.range * 0.7;
  if (dist > want) {
    m.aiming = dist < m.range;
    moveMob(g, m, dx, dz, chaseSpeed, dt, false);
  } else {
    m.aiming = true;
    const side = Math.sin(g.time * 0.7 + m.id) > 0 ? 1 : -1;
    moveMob(g, m, -dz * side, dx * side, chaseSpeed * 0.4, dt, false);
  }
  if (m.aiming && m.cd <= 0 && dist < m.range) {
    const head = tv.set(m.pos.x, m.pos.y + m.h * 0.8, m.pos.z);
    if (hasLOS(g, head, tgt)) {
      m.cd = m.fireRate * (0.8 + Math.random() * 0.5);
      enemyFire(g, m, tgt, !tAlly, tAlly);
    } else m.cd = 0.4;
  }
}

function updateWild(g: Game, m: Mob, dt: number, d2p: number) {
  const p = g.player;
  const st = m.speed;
  if (d2p < 28 * 28 && p.mode !== "ship") m.fleeT = 3;
  if (m.fleeT > 0 && m.fleeT !== 1) {
    m.fleeT -= dt;
    const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
    moveMob(g, m, dx + Math.sin(g.time + m.id) * 6, dz + Math.cos(g.time * 1.3 + m.id) * 6, st, dt);
    return;
  }
  if (m.fleeT === 1) m.fleeT = 0;
  m.wanderT -= dt;
  if (m.wanderT <= 0) {
    m.wanderT = 3 + Math.random() * 6;
    const hd = Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z);
    m.wanderYaw = hd > 40 ? Math.atan2(m.home.x - m.pos.x, m.home.z - m.pos.z) : Math.random() * 6.28;
    if (Math.random() < 0.5) m.wanderYaw = NaN;
  }
  if (!Number.isNaN(m.wanderYaw)) moveMob(g, m, Math.sin(m.wanderYaw), Math.cos(m.wanderYaw), st * 0.18, dt);
  else m.curSpeed = 0;
}

function updateSoldier(g: Game, m: Mob, dt: number, idx: number) {
  const p = g.player;
  const t = g.time;
  m.slot = idx;
  if (m.onDeck) {
    m.hum!.update(0, dt, false, t);
    m.group.visible = true;
    return;
  }
  m.group.visible = true;
  // find nearest enemy
  const reach = g.stance === "attack" ? 130 : 58;
  let en: Mob | null = null;
  let bd = reach * reach;
  for (const e of g.mobs) {
    if (e.faction === "ally" || e.dead || e.faction === "wild") continue;
    const d = e.pos.distanceToSquared(m.pos);
    if (d < bd) { bd = d; en = e; }
  }
  const ang = p.yaw + Math.PI + (idx - 3) * 0.55;
  const rad = 3 + (idx % 3) * 1.6;
  const dx = p.pos.x + Math.sin(ang) * rad - m.pos.x;
  const dz = p.pos.z + Math.cos(ang) * rad - m.pos.z;
  const dFollow = Math.hypot(dx, dz);
  if (dFollow > 140) {
    m.pos.set(p.pos.x + Math.sin(ang) * rad, p.pos.y, p.pos.z + Math.cos(ang) * rad);
  }
  let moving = false;
  m.aiming = false;
  if (en) {
    const dist = Math.sqrt(bd);
    const leash = g.stance === "attack" ? 999 : 22;
    faceTo(m, en.pos.x, en.pos.z, dt);
    const chaseDist = g.stance === "attack" ? 22 : 30;
    if (dist > chaseDist && dFollow < leash) {
      moveMob(g, m, en.pos.x - m.pos.x, en.pos.z - m.pos.z, m.speed, dt, false);
      moving = true;
    } else if (dFollow > leash) {
      moveMob(g, m, dx, dz, m.speed * 1.2, dt);
      moving = true;
    }
    m.aiming = dist < m.range;
    if (m.aiming && m.cd <= 0) {
      const head = tv.set(m.pos.x, m.pos.y + 1.6, m.pos.z);
      const tgt = tv2.set(en.pos.x, en.pos.y + en.h * 0.6, en.pos.z);
      if (hasLOS(g, head, tgt)) {
        m.cd = m.fireRate * (0.8 + Math.random() * 0.5);
        const from = head.clone().add(new THREE.Vector3(Math.sin(m.yaw) * 0.7, -0.2, Math.cos(m.yaw) * 0.7));
        const hit = Math.random() < clamp(0.85 - dist / 140, 0.25, 0.85);
        const aim = tgt.clone();
        if (!hit) aim.add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3));
        g.tracers.add(from, aim, 0.5, 0.8, 1);
        g.glow.emit(from.x, from.y, from.z, 0, 0, 0, 0.08, 0.5, 0.1, 1, 0.8, 0.4, 0.9);
        g.audio.shot("rifle", clamp(1 - from.distanceTo(g.camera.position) / 120, 0, 0.6));
        if (hit) damageMob(g, en, g.soldierDmg, false, "ally");
        if (en.faction === "enemy") en.alert = 6;
        if (g.time - g.lastBark > 9 && !en.dead) { g.lastBark = g.time; g.sayRandom(LINES.enemy, "askar"); }
      } else m.cd = 0.4;
    }
  } else if (dFollow > 2.2) {
    const sp = Math.max(m.speed, p.speed * 1.12) * (dFollow > 12 ? 1.25 : 1);
    moveMob(g, m, dx, dz, dFollow > 5 ? sp : sp * 0.6, dt);
    moving = true;
  }
  if (!moving) m.curSpeed = 0;
  m.group.position.copy(m.pos);
  m.group.rotation.y = m.yaw;
  m.hum!.update(m.curSpeed, dt, m.aiming, t);
  if (m.cd > 0) m.cd -= dt;
  if (g.cold() && m.pos.distanceToSquared(p.pos) < 50 * 50) breath(g, m, dt);
}

export function damageMob(g: Game, m: Mob, dmg: number, hs: boolean, from: "player" | "ally" | "blast") {
  if (m.dead) return;
  if (m.type === "prisoner" || m.caged) return;
  m.hp -= dmg;
  if (m.faction === "enemy") m.alert = 10;
  if (m.faction === "wild") m.fleeT = 4;
  if (m.hp <= 0) {
    m.dead = true;
    m.deadT = 0;
    m.aiming = false;
    m.curSpeed = 0;
    if (m.faction === "ally") {
      g.save.soldiers = Math.max(0, g.save.soldiers - 1);
      g.notify("Bir askaringiz halok bo'ldi");
      return;
    }
    if (from !== "blast" || true) {
      g.addGold(m.gold, true);
      g.save.kills++;
      g.notify(`${m.type === "boss" ? "SHOH" : m.faction === "wild" ? "Ov" : "Dushman"} yo'q qilindi  +${m.gold}${hs ? "  (boshga!)" : ""}`);
      if (g.time - g.lastPraise > 10 && m.faction === "enemy") { g.lastPraise = g.time; g.sayRandom(LINES.kill, "askar"); }
    }
    onMobKilled(g, m);
  }
}

export function restoreSoldiers(g: Game) {
  for (let i = 0; i < g.save.soldiers; i++) hireSoldier(g, false);
  setSoldiersOnDeck(g, g.player.mode === "ship");
}

export function hireSoldier(g: Game, announce: boolean): Mob {
  const p = g.player;
  const m = spawnMob(g, "soldier", p.pos.x, p.pos.z, { y: p.pos.y });
  if (announce) {
    g.save.soldiers++;
    g.sayRandom(LINES.hire, "askar", true);
    g.notify("Yangi askar qo'shiningizga qo'shildi");
  }
  if (p.mode === "ship") placeOnDeck(g, m);
  return m;
}

function placeOnDeck(g: Game, m: Mob) {
  const slots = g.shipObj.slots;
  const allies = g.mobs.filter((a) => a.faction === "ally" && a.type === "soldier" && !a.dead);
  const idx = Math.max(0, allies.indexOf(m));
  const s = slots[idx % slots.length];
  m.onDeck = true;
  g.shipObj.group.add(m.group);
  m.group.position.copy(s);
  m.group.rotation.set(0, s.x < 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  m.group.scale.setScalar(1);
}

export function setSoldiersOnDeck(g: Game, on: boolean) {
  const p = g.player;
  const allies = g.mobs.filter((a) => a.faction === "ally" && a.type === "soldier" && !a.dead);
  allies.forEach((m, i) => {
    if (on) placeOnDeck(g, m);
    else {
      if (m.onDeck) {
        g.shipObj.group.remove(m.group);
        g.scene.add(m.group);
      }
      m.onDeck = false;
      const a = (i / Math.max(1, allies.length)) * Math.PI * 2;
      const x = p.pos.x + Math.cos(a) * (3 + (i % 3));
      const z = p.pos.z + Math.sin(a) * (3 + (i % 3));
      m.pos.set(x, g.world.groundHeight(x, z), z);
      m.group.position.copy(m.pos);
      m.group.rotation.set(0, m.yaw, 0);
    }
  });
}

/* --------------------------------- towers --------------------------------- */

export function damageTower(g: Game, t: Tower, dmg: number, from: "player" | "ally") {
  if (t.dead) return;
  t.hp -= dmg;
  if (t.hp <= 0) {
    t.dead = true;
    t.deadT = 0;
    g.explode(new THREE.Vector3(t.pos.x, t.pos.y + 4, t.pos.z), 12, 0, "player");
    g.addGold(150);
    onTowerDestroyed(g, t);
  }
  void from;
}

export function updateTowers(g: Game, dt: number) {
  const p = g.player;
  for (const t of g.towers) {
    if (t.dead) {
      t.deadT += dt;
      t.obj.scale.y = Math.max(0.22, 1 - t.deadT * 0.5);
      t.obj.rotation.z = Math.min(0.12, t.deadT * 0.05);
      if (t.deadT < 25 && Math.random() < dt * 8) {
        g.smoke.emit(t.pos.x + (Math.random() - 0.5) * 2, t.pos.y + 2, t.pos.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 3, 1, 5, 0.14, 0.13, 0.12, 0.4, -0.5, 0.5);
      }
      continue;
    }
    const tgtPos = p.mode === "ship" ? g.ship.pos : p.pos;
    const d = Math.hypot(tgtPos.x - t.pos.x, tgtPos.z - t.pos.z);
    t.obj.visible = d < 1500;
    if (t.kind === "totem") {
      if (d < 50 && g.time - g.lastBark > 12) { /* eerie */ }
      continue;
    }
    if (d > 190 || d < 6) continue;
    const barrel = t.obj.getObjectByName("barrel");
    if (barrel) barrel.rotation.y = Math.atan2(tgtPos.x - t.pos.x, tgtPos.z - t.pos.z) * 0 ;
    t.obj.rotation.y = Math.atan2(tgtPos.x - t.pos.x, tgtPos.z - t.pos.z);
    t.cd -= dt;
    if (t.cd <= 0) {
      t.cd = 3.2 + Math.random();
      const from = new THREE.Vector3(t.pos.x, t.pos.y + 10.5, t.pos.z);
      const to = new THREE.Vector3(tgtPos.x, tgtPos.y + 1, tgtPos.z);
      const T = from.distanceTo(to) / 75;
      const spread = from.distanceTo(to) * 0.03;
      const v = to.sub(from).multiplyScalar(1 / T);
      v.y += 11 * T;
      v.x += (Math.random() - 0.5) * spread;
      v.z += (Math.random() - 0.5) * spread;
      g.spawnProjectile(from, v, "enemy", 24, 6, 9, 0.38);
      g.audio.shot("cannon", clamp(1 - d / 250, 0, 0.8));
      g.smoke.emit(from.x, from.y, from.z, 0, 1, 0, 2, 0.6, 3.2, 0.7, 0.7, 0.7, 0.5, -0.2, 0.8);
      g.glow.emit(from.x, from.y, from.z, 0, 0, 0, 0.1, 2, 0.4, 1, 0.7, 0.3, 0.9);
    }
  }
}

/* ------------------------------- enemy ships ------------------------------- */

export function spawnEnemyShip(g: Game, x: number, z: number, opts: { mission: boolean; island: number }): EShip {
  const ship = buildShip({ sail: 0x1d1d22, hull: 0x3a2418, accent: 0x7a1a1a, flag: 0xb01010 });
  const grp = ship.group;
  grp.scale.setScalar(0.85);
  grp.position.set(x, 0, z);
  grp.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  g.scene.add(grp);
  const es: EShip = {
    ship, pos: new THREE.Vector3(x, 0, z), yaw: Math.random() * 6.28, speed: 0, hp: 380, maxHp: 380, cd: 2 + Math.random() * 2, mission: opts.mission, island: opts.island,
    sinking: 0, anchor: new THREE.Vector3(x, 0, z), dead: false, r: 13, h: 12, orbit: Math.random() * 6.28, orbitDir: Math.random() < 0.5 ? 1 : -1,
  };
  g.eships.push(es);
  return es;
}

export function damageEShip(g: Game, s: EShip, dmg: number, from: "player" | "ally") {
  if (s.dead) return;
  s.hp -= dmg;
  if (s.hp <= 0) {
    s.dead = true;
    s.sinking = 0;
    g.explode(new THREE.Vector3(s.pos.x, 5, s.pos.z), 14, 0, "player");
    g.addGold(260);
    g.notify("Dushman kemasi cho'kmoqda!");
    g.sayRandom(LINES.sinkShip, "askar", true);
    onShipSunk(g, s);
  }
  void from;
}

export function updateEnemyShips(g: Game, dt: number) {
  const p = g.player;
  const sp = g.ship.pos;
  const t = g.time;
  // ambient respawn
  let ambient = 0;
  for (const s of g.eships) if (!s.dead && !s.mission) ambient++;
  g.eshipTimer -= dt;
  if (ambient < 3 && g.eshipTimer <= 0) {
    g.eshipTimer = 25;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * 6.28;
      const r = 900 + Math.random() * 700;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r;
      if (g.world.groundHeight(x, z) < -8 && g.world.groundHeight(x + 60, z) < -8 && g.world.groundHeight(x, z + 60) < -8) {
        spawnEnemyShip(g, x, z, { mission: false, island: -1 });
        break;
      }
    }
  }
  for (let i = g.eships.length - 1; i >= 0; i--) {
    const s = g.eships[i];
    const grp = s.ship.group;
    if (s.dead) {
      s.sinking += dt;
      grp.position.y -= dt * 1.5;
      grp.rotation.z += dt * 0.12;
      grp.rotation.x += dt * 0.04;
      if (s.sinking > 8) {
        g.scene.remove(grp);
        g.eships.splice(i, 1);
      }
      continue;
    }
    const dx = sp.x - s.pos.x, dz = sp.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    grp.visible = dist < 2600;
    if (dist > 2200) continue;
    let tx: number, tz: number;
    let speedT = 9;
    const chase = dist < 450;
    if (chase) {
      const ang = Math.atan2(dz, dx);
      if (dist > 130) { tx = sp.x; tz = sp.z; }
      else {
        tx = s.pos.x + Math.cos(ang + Math.PI / 2) * 100;
        tz = s.pos.z + Math.sin(ang + Math.PI / 2) * 100;
        speedT = 5;
      }
    } else if (s.mission && s.island >= 0) {
      const c = g.world.islands[s.island].def;
      tx = c.cx + Math.cos(s.orbit) * 660 * 1.18;
      tz = c.cz + Math.sin(s.orbit) * 1100 * 1.12;
      if (Math.hypot(tx - s.pos.x, tz - s.pos.z) < 90) s.orbit += 0.18 * s.orbitDir;
    } else {
      tx = s.anchor.x + Math.cos(s.orbit) * 500;
      tz = s.anchor.z + Math.sin(s.orbit) * 500;
      if (Math.hypot(tx - s.pos.x, tz - s.pos.z) < 80) s.orbit += 0.5 * s.orbitDir;
    }
    let dy = Math.atan2(tx - s.pos.x, tz - s.pos.z) - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // avoid land
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    let blocked = false;
    for (const off of [20, 40, 70]) {
      if (g.world.groundHeight(s.pos.x + fx * off, s.pos.z + fz * off) > -3.5) { blocked = true; break; }
    }
    if (blocked) { dy = 1.2 * s.orbitDir; speedT = 4; }
    s.yaw += clamp(dy, -0.35 * dt, 0.35 * dt);
    s.speed += (speedT - s.speed) * Math.min(1, dt * 0.4);
    s.pos.x += Math.sin(s.yaw) * s.speed * dt;
    s.pos.z += Math.cos(s.yaw) * s.speed * dt;
    const hc = waveHeight(s.pos.x, s.pos.z, t);
    const front = waveHeight(s.pos.x + fx * 12, s.pos.z + fz * 12, t);
    const back = waveHeight(s.pos.x - fx * 12, s.pos.z - fz * 12, t);
    const lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw);
    const hl = waveHeight(s.pos.x + lx * 4, s.pos.z + lz * 4, t);
    const hr = waveHeight(s.pos.x - lx * 4, s.pos.z - lz * 4, t);
    grp.position.set(s.pos.x, hc * 0.85 - 0.15, s.pos.z);
    grp.rotation.set(-Math.atan2(front - back, 24) * 0.9, s.yaw, Math.atan2(hl - hr, 8) * 0.9, "YXZ");
    if (dist < 500) s.ship.update(t, 1);
    if (s.speed > 2 && dist < 400 && Math.random() < dt * 14) {
      g.smoke.emit(s.pos.x - fx * 13, 0.2, s.pos.z - fz * 13, 0, 0.1, 0, 3, 1, 3.5, 0.92, 0.97, 1, 0.32, 0, 0.3);
    }
    // shooting
    s.cd -= dt;
    if (chase && dist < 230 && s.cd <= 0) {
      s.cd = 3.6 + Math.random() * 1.2;
      const from = new THREE.Vector3(s.pos.x, 4, s.pos.z);
      const to = new THREE.Vector3(sp.x + g.ship.speed * Math.sin(g.ship.yaw) * 1.0, 2, sp.z + g.ship.speed * Math.cos(g.ship.yaw) * 1.0);
      const T = from.distanceTo(to) / 85;
      const v = to.sub(from).multiplyScalar(1 / T);
      v.y += 11 * T;
      const spread = dist * 0.05;
      v.x += (Math.random() - 0.5) * spread;
      v.z += (Math.random() - 0.5) * spread;
      g.spawnProjectile(from, v, "enemy", 38, 5, 8, 0.33);
      g.audio.shot("cannon", clamp(1 - dist / 300, 0, 0.9));
      g.smoke.emit(from.x, from.y, from.z, 0, 1, 0, 2, 0.8, 3.6, 0.75, 0.75, 0.75, 0.5, -0.2, 0.8);
      g.glow.emit(from.x, from.y, from.z, 0, 0, 0, 0.12, 2.5, 0.4, 1, 0.7, 0.3, 0.9);
    }
  }
  void p;
}
