import * as THREE from "three";
import { mulberry32 } from "./noise";

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function stdMat(hex: number, rough = 0.85, metal = 0, emissive = 0, emi = 0, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const k = `${hex}_${rough}_${metal}_${emissive}_${emi}_${side}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, emissive: emissive, emissiveIntensity: emi, side });
    matCache.set(k, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const sphGeo = new THREE.SphereGeometry(1, 12, 9);
const coneGeo = new THREE.ConeGeometry(1, 1, 10);

export function box(w: number, h: number, l: number, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo, mat);
  m.scale.set(w, h, l);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
export function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 10): THREE.Mesh {
  const g = seg === 10 && rt === rb ? cylGeo : new THREE.CylinderGeometry(rt, rb, 1, seg);
  const m = new THREE.Mesh(g, mat);
  if (g === cylGeo) m.scale.set(rt, h, rt);
  else m.scale.set(1, h, 1);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export function sph(r: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(sphGeo, mat);
  m.scale.setScalar(r);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export function cone(r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(coneGeo, mat);
  m.scale.set(r, h, r);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/* ------------------------------ Humanoids ------------------------------ */

export interface Humanoid {
  group: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  head: THREE.Object3D;
  torso: THREE.Object3D;
  phase: number;
  update(speed: number, dt: number, aiming: boolean, t: number): void;
  headPos(): THREE.Vector3;
}

export interface HumanoidOpts {
  skin?: number;
  shirt: number;
  pants: number;
  hat?: "pirate" | "helmet" | "bandana" | "turban" | "none";
  hatColor?: number;
  scale?: number;
  gun?: boolean;
  gunColor?: number;
}

export function buildHumanoid(o: HumanoidOpts): Humanoid {
  const g = new THREE.Group();
  const skin = stdMat(o.skin ?? 0xd9a780, 0.8);
  const shirt = stdMat(o.shirt, 0.9);
  const pants = stdMat(o.pants, 0.9);
  const dark = stdMat(0x2a1f18, 0.7);
  const legL = new THREE.Object3D();
  const legR = new THREE.Object3D();
  legL.position.set(-0.11, 0.85, 0);
  legR.position.set(0.11, 0.85, 0);
  legL.add(box(0.17, 0.85, 0.2, pants, 0, -0.42, 0));
  legR.add(box(0.17, 0.85, 0.2, pants, 0, -0.42, 0));
  legL.add(box(0.19, 0.1, 0.3, dark, 0, -0.82, 0.04));
  legR.add(box(0.19, 0.1, 0.3, dark, 0, -0.82, 0.04));
  const torso = new THREE.Object3D();
  torso.position.set(0, 0.85, 0);
  torso.add(box(0.46, 0.62, 0.26, shirt, 0, 0.31, 0));
  torso.add(box(0.48, 0.08, 0.28, dark, 0, 0.04, 0));
  const head = new THREE.Object3D();
  head.position.set(0, 1.58, 0);
  head.add(box(0.2, 0.24, 0.22, skin, 0, 0.1, 0));
  head.add(box(0.05, 0.03, 0.02, dark, -0.05, 0.13, 0.115));
  head.add(box(0.05, 0.03, 0.02, dark, 0.05, 0.13, 0.115));
  const hc = o.hatColor ?? 0x222222;
  switch (o.hat ?? "none") {
    case "pirate":
      head.add(cyl(0.26, 0.26, 0.04, stdMat(hc, 0.8), 0, 0.23, 0));
      head.add(cyl(0.14, 0.17, 0.15, stdMat(hc, 0.8), 0, 0.32, 0));
      break;
    case "helmet":
      head.add(sph(0.16, stdMat(0x6a7078, 0.4, 0.7), 0, 0.2, 0));
      break;
    case "bandana":
      head.add(cyl(0.125, 0.125, 0.07, stdMat(hc, 0.9), 0, 0.2, 0));
      break;
    case "turban":
      head.add(sph(0.17, stdMat(hc, 0.9), 0, 0.24, 0));
      break;
    default:
      break;
  }
  const mkArm = (sx: number) => {
    const a = new THREE.Object3D();
    a.position.set(sx * 0.3, 1.42, 0);
    a.add(box(0.12, 0.6, 0.12, shirt, 0, -0.28, 0));
    a.add(box(0.1, 0.1, 0.1, skin, 0, -0.62, 0));
    return a;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  g.add(legL, legR, torso, head, armL, armR);
  if (o.gun) {
    const gun = new THREE.Group();
    gun.add(box(0.07, 0.1, 0.5, stdMat(o.gunColor ?? 0x3a2a1a, 0.6), 0, 0, 0.12));
    gun.add(box(0.04, 0.04, 0.5, stdMat(0x1a1a1a, 0.4, 0.8), 0, 0.03, 0.55));
    gun.position.set(0.05, -0.55, 0.05);
    armR.add(gun);
  }
  g.scale.setScalar(o.scale ?? 1);
  const h: Humanoid = {
    group: g, armL, armR, legL, legR, head, torso, phase: Math.random() * 6,
    update(speed, dt, aiming, t) {
      h.phase += speed * dt * 2.1;
      const k = Math.min(1, speed / 2.8);
      const sw = Math.sin(h.phase) * 0.85 * k;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      const breathe = Math.sin(t * 1.8 + h.phase * 0.0 + g.id) * 0.012;
      torso.scale.y = 1 + breathe;
      if (aiming) {
        armR.rotation.x = -1.35;
        armL.rotation.x = -1.2;
        armL.rotation.z = 0.25;
      } else {
        armL.rotation.x = -sw * 0.9;
        armR.rotation.x = o.gun ? -0.5 + sw * 0.15 : sw * 0.9;
        armL.rotation.z = 0;
      }
      torso.position.y = 0.85 + Math.abs(Math.sin(h.phase)) * 0.03 * k;
    },
    headPos() {
      return new THREE.Vector3(0, 1.7 * (o.scale ?? 1), 0).add(g.position);
    },
  };
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true;
  });
  return h;
}

/* ------------------------------ Quadrupeds ------------------------------ */

export interface Quadruped {
  group: THREE.Group;
  legs: THREE.Object3D[];
  phase: number;
  saddle: THREE.Object3D | null;
  update(speed: number, dt: number): void;
}

export function buildQuadruped(kind: "deer" | "zebra" | "goat" | "wolf" | "horse", scale = 1): Quadruped {
  const g = new THREE.Group();
  const cfg = {
    deer: { body: 0x9a6a3a, acc: 0xe8d8b8, legH: 0.85, len: 1.15, th: 0.42 },
    zebra: { body: 0xefefef, acc: 0x1a1a1a, legH: 0.95, len: 1.3, th: 0.5 },
    goat: { body: 0xcfc6b0, acc: 0x6a5a45, legH: 0.5, len: 0.85, th: 0.36 },
    wolf: { body: 0x6f7378, acc: 0x2a2c30, legH: 0.5, len: 0.95, th: 0.32 },
    horse: { body: 0x6b4226, acc: 0x1a120c, legH: 1.05, len: 1.5, th: 0.58 },
  }[kind];
  const bm = stdMat(cfg.body, 0.85);
  const am = stdMat(cfg.acc, 0.85);
  const body = new THREE.Group();
  body.position.y = cfg.legH + cfg.th / 2;
  body.add(box(cfg.th * 0.85, cfg.th, cfg.len, bm, 0, 0, 0));
  // neck + head
  const neck = new THREE.Group();
  neck.position.set(0, cfg.th * 0.25, cfg.len / 2 - 0.05);
  const up = kind === "wolf" ? 0.25 : 0.7;
  neck.rotation.x = -up;
  neck.add(box(cfg.th * 0.45, cfg.th * 0.45, cfg.len * 0.55, bm, 0, cfg.th * 0.15, cfg.len * 0.2));
  const headG = new THREE.Group();
  headG.position.set(0, cfg.th * 0.2, cfg.len * 0.5);
  headG.rotation.x = up * 0.9;
  headG.add(box(cfg.th * 0.4, cfg.th * 0.38, cfg.len * 0.34, bm, 0, 0, cfg.len * 0.08));
  headG.add(box(cfg.th * 0.26, cfg.th * 0.22, cfg.len * 0.2, kind === "horse" ? am : bm, 0, -0.04, cfg.len * 0.28));
  headG.add(box(0.04, 0.12, 0.05, am, -0.1, 0.22, 0));
  headG.add(box(0.04, 0.12, 0.05, am, 0.1, 0.22, 0));
  if (kind === "deer") {
    for (const s of [-1, 1]) {
      headG.add(box(0.03, 0.4, 0.03, am, s * 0.1, 0.4, -0.02));
      const br = box(0.03, 0.22, 0.03, am, s * 0.17, 0.5, -0.02);
      br.rotation.z = -s * 0.8;
      headG.add(br);
    }
  }
  if (kind === "goat") {
    for (const s of [-1, 1]) {
      const h = box(0.04, 0.22, 0.04, am, s * 0.09, 0.2, -0.04);
      h.rotation.x = -0.6;
      headG.add(h);
    }
  }
  neck.add(headG);
  body.add(neck);
  if (kind === "horse") {
    neck.add(box(0.06, cfg.th * 0.5, cfg.len * 0.5, am, 0, cfg.th * 0.4, cfg.len * 0.2));
  }
  if (kind === "zebra") {
    for (let i = -3; i <= 3; i++) body.add(box(cfg.th * 0.9, cfg.th * 1.02, 0.07, am, 0, 0, i * 0.17));
  }
  // tail
  const tail = box(0.07, cfg.legH * 0.55, 0.07, kind === "horse" ? am : bm, 0, -0.1, -cfg.len / 2 - 0.05);
  tail.rotation.x = kind === "wolf" ? -0.9 : 0.35;
  body.add(tail);
  g.add(body);
  let saddle: THREE.Object3D | null = null;
  if (kind === "horse") {
    saddle = new THREE.Group();
    saddle.add(box(cfg.th * 0.95, 0.07, 0.5, stdMat(0x8a2a1a, 0.7), 0, cfg.th / 2 + 0.04, -0.05));
    saddle.add(box(cfg.th * 1.0, 0.03, 0.62, stdMat(0xd8c070, 0.7), 0, cfg.th / 2 + 0.01, -0.05));
    body.add(saddle);
  }
  const legs: THREE.Object3D[] = [];
  const lx = cfg.th * 0.3;
  const lz = cfg.len * 0.4;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Object3D();
    leg.position.set(sx * lx, cfg.legH, sz * lz);
    leg.add(box(0.1, cfg.legH, 0.1, bm, 0, -cfg.legH / 2, 0));
    leg.add(box(0.11, 0.1, 0.12, am, 0, -cfg.legH + 0.05, 0.01));
    g.add(leg);
    legs.push(leg);
  }
  g.scale.setScalar(scale);
  g.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true;
  });
  const q: Quadruped = {
    group: g, legs, phase: Math.random() * 6, saddle,
    update(speed, dt) {
      q.phase += speed * dt * (kind === "horse" ? 1.7 : 2.4);
      const k = Math.min(1, speed / 2);
      const s = Math.sin(q.phase) * 0.8 * k;
      legs[0].rotation.x = s;
      legs[3].rotation.x = s;
      legs[1].rotation.x = -s;
      legs[2].rotation.x = -s;
      body.position.y = cfg.legH + cfg.th / 2 + Math.abs(Math.sin(q.phase)) * 0.05 * k;
      body.rotation.x = Math.sin(q.phase * 2) * 0.03 * k;
    },
  };
  return q;
}

/* -------------------------------- Cloth ---------------------------------- */

export class Cloth {
  mesh: THREE.Mesh;
  nx: number;
  ny: number;
  base: Float32Array;
  kind: "sail" | "flag";
  seed = Math.random() * 10;
  w: number;
  h: number;
  constructor(w: number, h: number, nx: number, ny: number, color: number, kind: "sail" | "flag") {
    const g = new THREE.PlaneGeometry(w, h, nx, ny);
    if (kind === "flag") g.translate(w / 2, 0, 0);
    this.base = (g.attributes.position.array as Float32Array).slice();
    this.mesh = new THREE.Mesh(g, stdMat(color, 0.95, 0, 0, 0, THREE.DoubleSide));
    this.mesh.castShadow = true;
    this.nx = nx;
    this.ny = ny;
    this.kind = kind;
    this.w = w;
    this.h = h;
  }
  update(t: number, wind: number) {
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const nx1 = this.nx + 1;
    for (let i = 0; i < pos.count; i++) {
      const ix = i % nx1;
      const iy = Math.floor(i / nx1);
      const u = ix / this.nx;
      const v = iy / this.ny; // 0 = top
      let z: number;
      if (this.kind === "sail") {
        const b = Math.sin(Math.PI * u) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, v * 0.9 + 0.05)));
        z = b * this.w * 0.11 * wind + Math.sin(t * 1.9 + u * 3 + v * 2 + this.seed) * 0.1 * wind * v;
      } else {
        z = Math.sin(t * 6 - u * 7 + this.seed) * 0.28 * u * wind + Math.sin(t * 3.3 - u * 4) * 0.12 * u;
        pos.setY(i, this.base[i * 3 + 1] + Math.sin(t * 4 - u * 5) * 0.06 * u);
      }
      pos.setX(i, this.base[i * 3] + (this.kind === "flag" ? -u * 0.08 * Math.abs(z) : 0));
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

/* --------------------------------- Ship ---------------------------------- */

export const SHIP_L = 34;
export const SHIP_W = 9;
export const deckY = (z: number) => {
  const u = (2 * z) / SHIP_L;
  return 1.9 + 1.2 * Math.max(0, u) ** 2 + 0.9 * Math.max(0, -u) ** 2;
};

export interface Ship {
  group: THREE.Group;
  cloths: Cloth[];
  slots: THREE.Vector3[];
  helm: THREE.Vector3;
  cannons: THREE.Object3D[];
  lantern: THREE.PointLight | null;
  wheel: THREE.Object3D;
  update(t: number, wind: number): void;
}

export function buildShip(o: { sail: number; hull: number; accent: number; flag: number; light?: boolean }): Ship {
  const g = new THREE.Group();
  const L = SHIP_L;
  const W = SHIP_W;
  const N = 18;
  const prof = 8;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const cHull = new THREE.Color(o.hull);
  const cDark = new THREE.Color(0x24190f);
  const cAcc = new THREE.Color(o.accent);
  const per = prof * 2 - 1;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 2 * t - 1;
    const z = -L / 2 + t * L;
    const f = u > 0 ? Math.pow(Math.max(0.0, 1 - Math.pow(u, 2.2)), 0.85) : Math.pow(Math.max(0, 1 - Math.pow(-u, 4.2)), 0.7) * 0.92;
    const b = Math.max(0.12, (W / 2) * f);
    const yTop = deckY(z);
    const yBot = -1.7 * (1 - 0.55 * Math.abs(u) ** 3);
    const pts: [number, number][] = [];
    for (let j = 0; j < prof; j++) {
      if (j < prof - 1) {
        const s = j / (prof - 2);
        pts.push([b * Math.pow(s, 0.62), yBot + (yTop - yBot) * Math.pow(s, 1.05)]);
      } else pts.push([b * 0.97, yTop + 0.95]);
    }
    const row: [number, number][] = [];
    for (let j = prof - 1; j >= 1; j--) row.push([-pts[j][0], pts[j][1]]);
    for (let j = 0; j < prof; j++) row.push([pts[j][0], pts[j][1]]);
    for (const [x, y] of row) {
      pos.push(x, y, z);
      const c = new THREE.Color();
      if (y < 0.3) c.copy(cDark);
      else if (y < yTop - 0.35) c.copy(cHull);
      else if (y < yTop + 0.1) c.copy(cAcc);
      else c.copy(cHull).multiplyScalar(0.8);
      const jit = 0.9 + 0.2 * Math.abs(Math.sin(y * 9 + z * 0.7));
      col.push(c.r * jit, c.g * jit, c.b * jit);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < per - 1; j++) {
      const a = i * per + j;
      const b2 = a + per;
      idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hg, hullMat);
  hull.castShadow = true;
  hull.receiveShadow = true;
  g.add(hull);
  // deck
  const dp: number[] = [];
  const di: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 2 * t - 1;
    const z = -L / 2 + t * L;
    const f = u > 0 ? Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.85) : Math.pow(Math.max(0, 1 - Math.pow(-u, 4.2)), 0.7) * 0.92;
    const b = Math.max(0.1, (W / 2) * f * 0.97);
    dp.push(-b, deckY(z) - 0.05, z, b, deckY(z) - 0.05, z);
    if (i < N) di.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di);
  dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0xa7794a, roughness: 0.9, side: THREE.DoubleSide }));
  deck.receiveShadow = true;
  g.add(deck);
  // plank lines
  const plank = stdMat(0x6a4a2c, 0.9);
  for (let k = -3; k <= 3; k++) {
    for (let zz = -L / 2 + 3; zz < L / 2 - 4; zz += 3.2) {
      g.add(box(0.03, 0.01, 3.1, plank, k * 1.1, deckY(zz) + 0.0, zz + 1.6, false));
    }
  }
  // masts, yards and sails
  const wood = stdMat(0x5a3d22, 0.85);
  const cloths: Cloth[] = [];
  const masts: [number, number, number][] = [[2, 24, 13], [11.5, 19, 10.5], [-8.5, 14, 8.5]];
  masts.forEach(([mz, mh, sw], mi) => {
    const dy = deckY(mz);
    g.add(cyl(0.38, 0.5, mh, wood, 0, dy + mh / 2, mz));
    const sailH = mh * 0.5;
    const yTop2 = dy + mh - 1.2;
    g.add(cyl(0.16, 0.16, sw + 1.6, wood, 0, yTop2, mz, 6).rotateZ(Math.PI / 2));
    const s1 = new Cloth(sw, sailH, 8, 8, o.sail, "sail");
    s1.mesh.position.set(0, yTop2 - sailH / 2, mz + 0.1);
    g.add(s1.mesh);
    cloths.push(s1);
    if (mi < 2) {
      const yMid = yTop2 - sailH - 1.3;
      g.add(cyl(0.14, 0.14, sw * 1.15, wood, 0, yMid + sailH * 0.5 + 0.1, mz, 6).rotateZ(Math.PI / 2));
      const s2 = new Cloth(sw * 1.1, sailH * 0.75, 8, 6, o.sail, "sail");
      s2.mesh.position.set(0, yMid - sailH * 0.1, mz + 0.1);
      g.add(s2.mesh);
      cloths.push(s2);
    }
    const flag = new Cloth(3.2, 1.5, 8, 3, o.flag, "flag");
    flag.mesh.position.set(0, dy + mh + 0.5, mz);
    flag.mesh.rotation.y = Math.PI / 2;
    g.add(flag.mesh);
    cloths.push(flag);
  });
  // bowsprit
  const bs = cyl(0.16, 0.24, 9, wood, 0, deckY(L / 2) + 1.6, L / 2 + 3);
  bs.rotation.x = Math.PI / 2 - 0.2;
  g.add(bs);
  // cabin
  const cabin = box(7, 2.5, 5, stdMat(0x6a4426, 0.85), 0, deckY(-14) + 1.25, -14);
  g.add(cabin);
  g.add(box(7.4, 0.2, 5.4, stdMat(0x4a2f1a, 0.8), 0, deckY(-14) + 2.6, -14));
  for (const x of [-2.2, 0, 2.2]) g.add(box(1, 0.8, 0.05, stdMat(0xffd88a, 0.3, 0, 0xffb040, 0.6), x, deckY(-14) + 1.5, -11.45, false));
  // cannons
  const cannons: THREE.Object3D[] = [];
  const cm = stdMat(0x1c1c1e, 0.45, 0.7);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const z = -6 + k * 3.4 + (k > 1 ? 0.8 : 0);
      const c = cyl(0.26, 0.34, 2, cm, s * (W / 2 - 0.9), deckY(z) + 0.55, z, 10);
      c.rotation.z = -s * Math.PI / 2;
      g.add(c);
      cannons.push(c);
      g.add(box(0.7, 0.35, 1.2, stdMat(0x5a3d22, 0.9), s * (W / 2 - 1.2), deckY(z) + 0.2, z));
    }
  }
  // wheel
  const wheel = new THREE.Group();
  wheel.position.set(0, deckY(-9) + 1.1, -9);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 16), wood));
  for (let i = 0; i < 8; i++) {
    const sp = box(0.05, 1.5, 0.05, wood, 0, 0, 0);
    sp.rotation.z = (i / 8) * Math.PI;
    wheel.add(sp);
  }
  g.add(wheel);
  g.add(box(0.2, 1.1, 0.2, wood, 0, deckY(-9) + 0.5, -9.1));
  // lanterns
  const lm = stdMat(0xffd070, 0.4, 0, 0xffa030, 1.5);
  for (const [x, z] of [[-3.6, -16], [3.6, -16], [0, 15.5]]) g.add(sph(0.22, lm, x, deckY(z) + 1.8, z));
  let lantern: THREE.PointLight | null = null;
  if (o.light) {
    lantern = new THREE.PointLight(0xffb060, 0, 55, 1.6);
    lantern.position.set(0, deckY(-14) + 3.2, -12);
    g.add(lantern);
  }
  // soldier slots
  const slots: THREE.Vector3[] = [];
  for (let z = -5.5; z <= 17; z += 2.1) {
    for (const x of [-3.1, -1.6, 1.6, 3.1]) {
      if (Math.abs(z - 2) < 1.3 && Math.abs(x) < 2) continue;
      if (Math.abs(z - 11.5) < 1.3 && Math.abs(x) < 2) continue;
      const f = Math.abs((2 * z) / L);
      if (f > 0.8 && Math.abs(x) > 1.7) continue;
      slots.push(new THREE.Vector3(x, deckY(z), z));
    }
  }
  const helm = new THREE.Vector3(0, deckY(-10.4) + 1.7, -10.4);
  const ship: Ship = {
    group: g, cloths, slots, helm, cannons, lantern, wheel,
    update(t, wind) {
      for (const c of cloths) c.update(t, wind);
    },
  };
  return ship;
}

/* ------------------------------- Buildings ------------------------------- */

export function buildHut(rng: () => number = Math.random): THREE.Group {
  const g = new THREE.Group();
  const wall = stdMat([0x9a7a50, 0x8a6a48, 0xa08860][Math.floor(rng() * 3)], 0.95);
  g.add(box(4.2, 2.5, 4.2, wall, 0, 1.25, 0));
  g.add(box(1, 1.8, 0.1, stdMat(0x2a1a10, 0.9), 0, 0.9, 2.13, false));
  const roof = cone(3.9, 2.2, stdMat(0xb89a52, 1), 0, 3.5, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(3.7, 2.2, 3.7);
  g.add(roof);
  g.add(box(0.1, 2.5, 0.1, stdMat(0x4a3220, 0.9), 2.1, 1.25, 2.1));
  g.add(box(0.1, 2.5, 0.1, stdMat(0x4a3220, 0.9), -2.1, 1.25, 2.1));
  g.add(box(0.8, 0.8, 0.1, stdMat(0xffd88a, 0.3, 0, 0xffa030, 0.4), 1.5, 1.5, 2.13, false));
  return g;
}

export function buildTent(color = 0xc8b48a): THREE.Group {
  const g = new THREE.Group();
  const t = cone(2.6, 2.6, stdMat(color, 1, 0, 0, 0, THREE.DoubleSide), 0, 1.3, 0);
  t.scale.set(2.6, 2.6, 2.6);
  g.add(t);
  g.add(cyl(0.06, 0.06, 3.4, stdMat(0x4a3220), 0, 1.7, 0));
  return g;
}

export function buildCampfire(): THREE.Group {
  const g = new THREE.Group();
  const log = stdMat(0x3a2616, 1);
  for (let i = 0; i < 5; i++) {
    const l = cyl(0.09, 0.09, 1, log, 0, 0.12, 0, 6);
    l.rotation.set(Math.PI / 2.4, (i / 5) * Math.PI * 2, 0);
    l.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.18, 0.2, Math.sin((i / 5) * Math.PI * 2) * 0.18);
    g.add(l);
  }
  const stone = stdMat(0x6a6a66, 0.95);
  for (let i = 0; i < 8; i++) {
    const s = sph(0.16, stone, Math.cos(i * 0.785) * 0.62, 0.08, Math.sin(i * 0.785) * 0.62);
    s.scale.y = 0.6;
    g.add(s);
  }
  const f1 = cone(0.3, 0.9, stdMat(0xff8a20, 0.5, 0, 0xff6a10, 2.2), 0, 0.6, 0);
  f1.name = "flame";
  g.add(f1);
  const f2 = cone(0.18, 0.7, stdMat(0xffd060, 0.5, 0, 0xffc040, 2.5), 0, 0.5, 0);
  f2.name = "flame2";
  g.add(f2);
  return g;
}

export function buildCannonTower(): THREE.Group {
  const g = new THREE.Group();
  const stone = stdMat(0x8a8780, 0.95);
  g.add(cyl(2.8, 3.2, 9, stone, 0, 4.5, 0, 12));
  g.add(cyl(3.4, 3.2, 1, stdMat(0x777470, 0.95), 0, 9.3, 0, 12));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(box(0.9, 0.8, 0.9, stone, Math.cos(a) * 3.2, 10.2, Math.sin(a) * 3.2));
  }
  const c = cyl(0.4, 0.5, 3.2, stdMat(0x1c1c1e, 0.4, 0.7), 0, 10.2, 0.8, 10);
  c.rotation.x = Math.PI / 2 - 0.3;
  c.name = "barrel";
  g.add(c);
  g.add(box(1.4, 2.2, 0.1, stdMat(0x2a1a10, 0.9), 0, 1.1, 3.1, false));
  return g;
}

export function buildTotem(): THREE.Group {
  const g = new THREE.Group();
  const dark = stdMat(0x1f1a1c, 0.8);
  for (let i = 0; i < 4; i++) g.add(box(1.8 - i * 0.2, 1.8, 1.8 - i * 0.2, dark, 0, 0.9 + i * 1.8, 0));
  const eye = stdMat(0xff2a10, 0.3, 0, 0xff2000, 2.5);
  for (const s of [-1, 1]) g.add(box(0.3, 0.2, 0.1, eye, s * 0.3, 5.0, 0.7, false));
  g.add(cone(0.7, 1.8, dark, 0, 8.2, 0));
  g.add(sph(0.3, eye, 0, 7.6, 0));
  return g;
}

export function buildLighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const r0 = 4.2 - i * 0.28;
    g.add(cyl(r0 - 0.28, r0, 4.6, stdMat(i % 2 ? 0xc43a30 : 0xf2f0e8, 0.8), 0, 2.3 + i * 4.6, 0, 14));
  }
  g.add(cyl(2.6, 2.6, 0.5, stdMat(0x2a2a2e, 0.6), 0, 37.2, 0, 14));
  g.add(cyl(1.5, 1.5, 2.2, stdMat(0xfff0b0, 0.3, 0, 0xffe090, 2.2), 0, 38.4, 0, 12));
  g.add(cone(1.9, 1.8, stdMat(0xc43a30, 0.7), 0, 40.4, 0));
  const beam = new THREE.Mesh(new THREE.ConeGeometry(14, 90, 16, 1, true).rotateZ(Math.PI / 2).translate(45, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 38.4;
  beam.name = "beam";
  g.add(beam);
  return g;
}

export function buildDock(len = 18): THREE.Group {
  const g = new THREE.Group();
  const w = stdMat(0x7a5a38, 0.95);
  for (let i = 0; i < len; i++) g.add(box(3, 0.16, 0.9, stdMat(i % 2 ? 0x7a5a38 : 0x6a4c30, 0.95), 0, 0.9, i * 1.0 - len / 2));
  for (let i = 0; i <= len; i += 3) {
    g.add(cyl(0.16, 0.16, 5, w, -1.6, -0.6, i - len / 2, 6));
    g.add(cyl(0.16, 0.16, 5, w, 1.6, -0.6, i - len / 2, 6));
  }
  return g;
}

export function buildChest(): THREE.Group {
  const g = new THREE.Group();
  const wood = stdMat(0x7a4a22, 0.8);
  const gold = stdMat(0xe0b030, 0.35, 0.8, 0xc08a10, 0.5);
  g.add(box(1.1, 0.55, 0.7, wood, 0, 0.28, 0));
  const lid = cyl(0.35, 0.35, 1.1, wood, 0, 0.58, 0, 10);
  lid.rotation.z = Math.PI / 2;
  g.add(lid);
  g.add(box(0.1, 0.6, 0.74, gold, -0.35, 0.3, 0));
  g.add(box(0.1, 0.6, 0.74, gold, 0.35, 0.3, 0));
  g.add(box(0.14, 0.18, 0.06, gold, 0, 0.55, 0.36));
  return g;
}

export function buildCrystalPickup(color = 0x80b0ff): THREE.Group {
  const g = new THREE.Group();
  const m = stdMat(color, 0.15, 0.2, color, 1.4);
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), m);
  c.scale.y = 1.7;
  c.position.y = 1.2;
  g.add(c);
  return g;
}

export function buildPearl(): THREE.Group {
  const g = new THREE.Group();
  const shell = stdMat(0xeed8c8, 0.5);
  const a = sph(0.5, shell, 0, 0.25, 0);
  a.scale.set(1, 0.45, 1);
  g.add(a);
  g.add(sph(0.2, stdMat(0xffffff, 0.15, 0.3, 0xdde8ff, 1.2), 0, 0.5, 0));
  return g;
}

export function buildBeaconTower(): THREE.Group {
  const g = new THREE.Group();
  const stone = stdMat(0x8a8a88, 0.95);
  g.add(cyl(1.2, 1.7, 3.2, stone, 0, 1.6, 0, 8));
  g.add(cyl(1.5, 1.2, 0.4, stone, 0, 3.3, 0, 8));
  const f = cone(0.7, 1.8, stdMat(0xff7a20, 0.5, 0, 0xff5a10, 2.4), 0, 4.4, 0);
  f.name = "flame";
  f.visible = false;
  g.add(f);
  const f2 = cone(0.4, 1.3, stdMat(0xffd060, 0.5, 0, 0xffc040, 2.5), 0, 4.2, 0);
  f2.name = "flame2";
  f2.visible = false;
  g.add(f2);
  return g;
}

export function buildShrine(): THREE.Group {
  const g = new THREE.Group();
  const red = stdMat(0xc8341e, 0.6);
  const blk = stdMat(0x1c1818, 0.7);
  g.add(cyl(0.3, 0.35, 5.5, red, -1.9, 2.75, 0, 8));
  g.add(cyl(0.3, 0.35, 5.5, red, 1.9, 2.75, 0, 8));
  g.add(box(5.8, 0.4, 0.5, blk, 0, 5.6, 0));
  g.add(box(4.6, 0.3, 0.4, red, 0, 4.7, 0));
  g.add(box(0.5, 0.9, 0.5, stdMat(0x777770, 0.9), 0, 0.45, 1.8));
  const l = sph(0.28, stdMat(0xffb060, 0.4, 0, 0xff8a20, 0.2), 0, 1.2, 1.8);
  l.name = "lamp";
  g.add(l);
  return g;
}

export function buildCage(): THREE.Group {
  const g = new THREE.Group();
  const bar = stdMat(0x3a3a3e, 0.5, 0.8);
  for (let i = -1; i <= 1; i += 1) {
    for (const s of [-1, 1]) {
      g.add(cyl(0.04, 0.04, 2.6, bar, i * 0.8, 1.3, s * 1.2, 5));
      g.add(cyl(0.04, 0.04, 2.6, bar, s * 1.2, 1.3, i * 0.8, 5));
    }
  }
  g.add(box(2.6, 0.08, 2.6, bar, 0, 2.6, 0));
  g.add(box(2.6, 0.08, 2.6, bar, 0, 0.05, 0));
  return g;
}

export function buildFlagPole(color: number, h = 16): { group: THREE.Group; cloth: Cloth } {
  const g = new THREE.Group();
  g.add(cyl(0.12, 0.16, h, stdMat(0xd8d8d0, 0.5, 0.5), 0, h / 2, 0, 8));
  g.add(sph(0.22, stdMat(0xe0b030, 0.3, 0.8), 0, h + 0.1, 0));
  const cloth = new Cloth(5, 3, 10, 5, color, "flag");
  cloth.mesh.position.set(0, h - 1.8, 0);
  cloth.mesh.rotation.y = Math.PI / 2;
  g.add(cloth.mesh);
  return { group: g, cloth };
}

export function buildBeam(color: number, h = 120, r = 1.4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.6, h, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.y = h / 2;
  return m;
}

/* ---------------------------- Weapon view models --------------------------- */

export function buildViewModel(id: number): THREE.Group {
  const g = new THREE.Group();
  const steel = stdMat(0x2a2c30, 0.35, 0.85);
  const wood = stdMat(0x6a4222, 0.65);
  const brass = stdMat(0xb08a30, 0.4, 0.8);
  const skin = stdMat(0xd9a780, 0.8);
  const add = (m: THREE.Object3D) => { m.castShadow = false; g.add(m); };
  let muzzle = -0.4;
  switch (id) {
    case 0:
      add(box(0.05, 0.09, 0.2, steel, 0, 0, -0.1));
      add(box(0.028, 0.028, 0.16, steel, 0, 0.03, -0.27));
      const grip = box(0.045, 0.11, 0.06, wood, 0, -0.08, 0.0);
      grip.rotation.x = 0.3;
      add(grip);
      add(cyl(0.045, 0.045, 0.07, brass, 0, 0.0, -0.08, 8));
      muzzle = -0.36;
      break;
    case 1:
      add(box(0.06, 0.1, 0.45, wood, 0, -0.03, 0.12));
      add(box(0.03, 0.03, 0.8, steel, 0, 0.03, -0.45));
      add(box(0.05, 0.07, 0.15, brass, 0, 0.02, -0.12));
      muzzle = -0.86;
      break;
    case 2:
      add(box(0.06, 0.1, 0.4, wood, 0, -0.03, 0.12));
      add(box(0.028, 0.028, 0.7, steel, -0.017, 0.03, -0.42));
      add(box(0.028, 0.028, 0.7, steel, 0.017, 0.03, -0.42));
      add(box(0.07, 0.05, 0.22, wood, 0, -0.02, -0.28));
      muzzle = -0.78;
      break;
    case 3:
      add(box(0.06, 0.12, 0.38, steel, 0, 0, -0.1));
      add(box(0.04, 0.2, 0.07, steel, 0, -0.15, -0.14));
      add(box(0.03, 0.03, 0.18, steel, 0, 0.02, -0.38));
      add(box(0.05, 0.1, 0.2, wood, 0, -0.04, 0.2));
      muzzle = -0.48;
      break;
    case 4:
      add(box(0.055, 0.1, 0.5, wood, 0, -0.03, 0.15));
      add(box(0.025, 0.025, 1.0, steel, 0, 0.03, -0.55));
      add(cyl(0.035, 0.035, 0.26, steel, 0, 0.1, -0.12, 8).rotateX(Math.PI / 2));
      muzzle = -1.05;
      break;
    default:
      add(cyl(0.07, 0.07, 0.6, steel, 0, 0, -0.25, 10).rotateX(Math.PI / 2));
      add(cyl(0.1, 0.1, 0.12, brass, 0, -0.02, -0.1, 10).rotateX(Math.PI / 2));
      add(box(0.06, 0.1, 0.3, wood, 0, -0.04, 0.2));
      muzzle = -0.58;
      break;
  }
  const hand = box(0.07, 0.08, 0.1, skin, 0, -0.1, 0.02);
  add(hand);
  const hand2 = box(0.07, 0.08, 0.1, skin, 0, -0.07, -0.25);
  if (id !== 0) add(hand2);
  g.userData.muzzle = muzzle;
  return g;
}

export function humanoidVariants(seed: number) {
  const r = mulberry32(seed);
  const shirts = [0x8a2a2a, 0x2a4a8a, 0x5a5a2a, 0x3a3a3a, 0x7a4a2a];
  return { shirt: shirts[Math.floor(r() * shirts.length)], pants: [0x2a2a30, 0x3a2a1a, 0x1f2a3a][Math.floor(r() * 3)] };
}
