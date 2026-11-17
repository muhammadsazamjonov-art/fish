import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ISLAND_A, ISLAND_B, type VegKind } from "./data";
import { fbm, hash2, mulberry32, smoothstep, vnoise } from "./noise";
import type { IslandData, World } from "./world";

export const windU = { uTime: { value: 0 }, uWind: { value: 1 } };

export function swayMaterial(amp: number, flutter: number, opts: { emissive?: number; emi?: number; rough?: number; metal?: number; side?: THREE.Side } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.rough ?? 0.92,
    metalness: opts.metal ?? 0,
    side: opts.side ?? THREE.DoubleSide,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emi ?? 0,
  });
  if (amp > 0 || flutter > 0) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windU.uTime;
      shader.uniforms.uWind = windU.uWind;
      shader.uniforms.uAmp = { value: amp };
      shader.uniforms.uFlut = { value: flutter };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform float uAmp;\nuniform float uFlut;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float hgt = max(position.y, 0.0);
            vec3 ip = vec3(0.0);
            #ifdef USE_INSTANCING
              ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            #endif
            float ph = ip.x * 0.045 + ip.z * 0.037;
            float gust = 0.65 + 0.35 * sin(uTime * 0.37 + ip.x * 0.004 + ip.z * 0.003);
            float w = sin(uTime * 1.7 + ph) + 0.5 * sin(uTime * 3.1 + ph * 2.3);
            float k = hgt * hgt * uAmp * uWind * gust;
            transformed.x += w * k;
            transformed.z += cos(uTime * 1.3 + ph) * k * 0.6;
            transformed.y += sin(uTime * 6.0 + position.x * 3.0 + position.z * 2.0 + ph) * 0.012 * hgt * uFlut * uWind;
          }`
        );
    };
    mat.customProgramCacheKey = () => `sway_${amp}_${flutter}`;
  }
  return mat;
}

type V3 = [number, number, number];

function hash3(x: number, y: number, z: number) {
  return vnoise(x * 3.1 + z * 1.7, y * 4.3 + z * 2.9, 5);
}

function part(g: THREE.BufferGeometry, hex: number, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1], jit = 0.12): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(s[0], s[1], s[2]));
  geo.applyMatrix4(m);
  const c = new THREE.Color(hex);
  const pos = geo.attributes.position;
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const j = 1 + (hash3(pos.getX(i), pos.getY(i), pos.getZ(i)) - 0.5) * 2 * jit;
    arr[i * 3] = c.r * j;
    arr[i * 3 + 1] = c.g * j;
    arr[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

function blob(r: number, rough: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + (hash3(x / r, y / r, z / r) - 0.5) * rough;
    p.setXYZ(i, x * d, y * d, z * d);
  }
  return g;
}

function frond(len: number, w: number): THREE.BufferGeometry {
  const segs = 6;
  const pos: number[] = [];
  const row: [V3, V3][] = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const x = t * len;
    const y = Math.sin(t * 1.5) * len * 0.22 - t * t * len * 0.28;
    const hw = (w / 2) * Math.sin(Math.PI * (0.12 + 0.88 * t)) * (1 - t * 0.3);
    row.push([[x, y + hw * 0.35, -hw], [x, y + hw * 0.35, hw]]);
  }
  for (let s = 0; s < segs; s++) {
    const [a, b] = row[s];
    const [c, d] = row[s + 1];
    pos.push(...a, ...c, ...b, ...b, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function tube(points: V3[], r0: number, r1: number, seg = 8, rad = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = g.attributes.position;
  const ringVerts = rad + 1;
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / ringVerts);
    const t = ring / seg;
    const c = curve.getPointAt(Math.min(1, t));
    const k = r0 + (r1 - r0) * t;
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
  }
  return g;
}

const cyl = (r0: number, r1: number, h: number, seg = 7) => new THREE.CylinderGeometry(r1, r0, h, seg, 1).translate(0, h / 2, 0);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0);

function shade(g: THREE.BufferGeometry, h: number, strength = 0.38) {
  const p = g.attributes.position;
  const c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const f = 1 - strength + strength * smoothstep(0, h * 0.4, p.getY(i));
    c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
  }
  return g;
}

function merge(list: THREE.BufferGeometry[], h: number, strength = 0.38) {
  const g = mergeGeometries(list, false)!;
  shade(g, h, strength);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const geoCache = new Map<VegKind, THREE.BufferGeometry>();

export function vegGeometry(kind: VegKind): THREE.BufferGeometry {
  const hit = geoCache.get(kind);
  if (hit) return hit;
  const L: THREE.BufferGeometry[] = [];
  let H = 8;
  switch (kind) {
    case "palm": {
      L.push(part(tube([[0, 0, 0], [0.3, 3, 0], [0.9, 6, 0], [1.8, 8.6, 0]], 0.3, 0.17, 8, 6), 0x6e5438, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.1));
      const fr = frond(4.6, 1.15);
      for (let i = 0; i < 10; i++) {
        const yaw = (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
        L.push(part(fr, 0x3f8f2a, [1.8, 8.6, 0], [0, yaw, (i % 3) * 0.15 - 0.1], [1 + (i % 3) * 0.1, 1, 1], 0.2));
      }
      const cs = new THREE.SphereGeometry(0.22, 6, 5);
      for (let i = 0; i < 3; i++) L.push(part(cs, 0x5a4020, [1.8 + Math.cos(i * 2.1) * 0.3, 8.3, Math.sin(i * 2.1) * 0.3]));
      H = 9.5;
      break;
    }
    case "pine":
    case "snowpine": {
      const snow = kind === "snowpine";
      L.push(part(cyl(0.36, 0.1, 10, 6), 0x4a3a2a));
      for (let i = 0; i < 5; i++) {
        const r = 2.7 - i * 0.48;
        L.push(part(cone(r, 3.6, 9), snow ? 0xc9dcd8 : 0x1f4d2c, [0, 2.2 + i * 1.6, 0], [0, i * 0.7, 0], [1, 1, 1], 0.14));
      }
      H = 12.5;
      break;
    }
    case "oak": {
      L.push(part(tube([[0, 0, 0], [0.1, 2, 0.1], [-0.2, 4.2, 0]], 0.5, 0.3, 5, 6), 0x5a432c));
      const offs: V3[] = [[0, 6.2, 0], [1.9, 5.4, 0.6], [-1.8, 5.6, -0.7], [0.4, 7.4, 1.4], [-0.5, 5.3, 1.8]];
      offs.forEach((o, i) => L.push(part(blob(2.1 + (i % 2) * 0.5, 0.55), 0x3f7a2a, o, [0, i, 0], [1, 0.85, 1], 0.16)));
      H = 9.5;
      break;
    }
    case "birch": {
      L.push(part(tube([[0, 0, 0], [0.15, 3, 0], [0, 6.5, 0.1]], 0.22, 0.12, 5, 6), 0xe4e0d2, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.06));
      const offs: V3[] = [[0, 7.2, 0], [1.1, 6, 0.4], [-1.1, 6.4, -0.3], [0.2, 8.4, 0.5]];
      offs.forEach((o, i) => L.push(part(blob(1.5, 0.5), 0x9cb840, o, [i, 0, 0], [1, 1, 1], 0.18)));
      H = 9.5;
      break;
    }
    case "acacia": {
      L.push(part(tube([[0, 0, 0], [0.3, 2.5, 0], [1.2, 4.6, 0.2], [0.9, 6, 0]], 0.38, 0.2, 6, 6), 0x6b5236));
      L.push(part(blob(3.4, 0.4), 0x7a9a35, [0.9, 6.6, 0], [0, 0, 0], [1.5, 0.38, 1.5], 0.15));
      L.push(part(blob(2.2, 0.4), 0x6a8a30, [-1.6, 5.7, 1.2], [0, 0, 0], [1.3, 0.34, 1.3], 0.15));
      H = 8;
      break;
    }
    case "cactus": {
      L.push(part(new THREE.CapsuleGeometry(0.45, 3.2, 3, 8).translate(0, 2.1, 0), 0x4a8a3a, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.07));
      L.push(part(new THREE.CapsuleGeometry(0.28, 1.2, 3, 7).rotateZ(Math.PI / 2).translate(0.9, 2.1, 0), 0x4a8a3a));
      L.push(part(new THREE.CapsuleGeometry(0.26, 1.5, 3, 7).translate(1.5, 2.9, 0), 0x4a8a3a));
      L.push(part(new THREE.CapsuleGeometry(0.26, 1.0, 3, 7).rotateZ(Math.PI / 2).translate(-0.8, 1.4, 0), 0x4a8a3a));
      L.push(part(new THREE.CapsuleGeometry(0.24, 1.0, 3, 7).translate(-1.35, 1.9, 0), 0x4a8a3a));
      H = 4.5;
      break;
    }
    case "bush": {
      const offs: V3[] = [[0, 0.6, 0], [0.8, 0.5, 0.3], [-0.7, 0.5, -0.2], [0.1, 0.9, -0.7]];
      offs.forEach((o, i) => L.push(part(blob(0.75 + (i % 2) * 0.2, 0.5), 0x4a8030, o, [i, 0, 0], [1, 0.8, 1], 0.2)));
      H = 1.6;
      break;
    }
    case "rock": {
      L.push(part(blob(1.2, 0.7, 1), 0x8a8780, [0, 0.5, 0], [0.3, 1, 0.2], [1.2, 0.75, 1], 0.2));
      L.push(part(blob(0.6, 0.6, 1), 0x7a7870, [1.2, 0.2, 0.5], [1, 0, 0], [1, 0.8, 1], 0.2));
      H = 2;
      break;
    }
    case "lavarock": {
      L.push(part(blob(1.3, 0.8, 1), 0x2a211e, [0, 0.5, 0], [0.3, 1, 0.2], [1.2, 0.8, 1], 0.25));
      L.push(part(blob(0.7, 0.6, 1), 0x3a2822, [1.3, 0.2, 0.4], [1, 0, 0], [1, 0.8, 1], 0.25));
      H = 2;
      break;
    }
    case "deadtree": {
      L.push(part(tube([[0, 0, 0], [0.2, 2, 0.1], [-0.1, 4, 0], [0.2, 6, 0.1]], 0.34, 0.07, 6, 5), 0x5a4a3a, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0.1));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        L.push(part(cyl(0.12, 0.03, 2.4, 4), 0x55463a, [0, 2.6 + i * 0.6, 0], [Math.cos(a) * 0.9, a, Math.sin(a) * 0.9 + 0.9]));
      }
      H = 7;
      break;
    }
    case "reed": {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        const h = 1.8 + (i % 3) * 0.4;
        L.push(part(cone(0.05, h, 4), 0x7d9040, [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12], [1, 1, 1], 0.12));
        if (i % 2 === 0) L.push(part(cyl(0.07, 0.07, 0.35, 5), 0x4a3320, [Math.cos(a) * 0.25 + Math.sin(a) * 0.08 * h, h * 0.78, Math.sin(a) * 0.25 + Math.cos(a) * 0.08 * h]));
      }
      H = 2.4;
      break;
    }
    case "crystal": {
      const cs = new THREE.ConeGeometry(0.5, 1, 5);
      const defs: [V3, V3, number, number][] = [
        [[0, 0, 0], [0, 0, 0], 1.2, 3.4], [[0.7, 0, 0.2], [0.3, 0, -0.4], 0.8, 2.4], [[-0.6, 0, -0.3], [-0.2, 0.5, 0.35], 0.9, 2.8], [[0.1, 0, -0.8], [-0.4, 0, 0.1], 0.6, 1.6],
      ];
      defs.forEach(([p, r, w, h], i) => L.push(part(cs.clone().translate(0, 0.5, 0), i % 2 ? 0xa890ff : 0x80d8ff, p, r, [w, h, w], 0.18)));
      H = 3.4;
      break;
    }
    case "sakura": {
      L.push(part(tube([[0, 0, 0], [0.3, 1.8, 0], [-0.3, 3.4, 0.2], [0.2, 4.4, 0]], 0.42, 0.24, 6, 6), 0x4a3028));
      const offs: V3[] = [[0, 6, 0], [2, 5, 0.5], [-2, 5.2, -0.5], [0.5, 7.2, 1.2], [-0.8, 5.6, 2], [1, 5.4, -1.8]];
      offs.forEach((o, i) => L.push(part(blob(1.9 + (i % 2) * 0.4, 0.5), i % 2 ? 0xffb6cf : 0xffd0e0, o, [0, i, 0], [1, 0.8, 1], 0.12)));
      H = 8.5;
      break;
    }
    case "mushroom": {
      L.push(part(cyl(0.28, 0.2, 1.4, 6), 0xe8dcc0));
      L.push(part(new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xd04a30, [0, 1.35, 0], [0, 0, 0], [1.25, 0.8, 1.25], 0.1));
      L.push(part(new THREE.SphereGeometry(0.16, 5, 4), 0xfff2e0, [0.5, 2.0, 0.3]));
      L.push(part(new THREE.SphereGeometry(0.12, 5, 4), 0xfff2e0, [-0.4, 2.05, -0.5]));
      H = 2.3;
      break;
    }
    case "log": {
      L.push(part(cyl(0.38, 0.34, 4, 7), 0x6a4a30, [-2, 0.34, 0], [0, 0, Math.PI / 2]));
      H = 1;
      break;
    }
  }
  const g = merge(L, H, kind === "rock" || kind === "lavarock" || kind === "crystal" ? 0.1 : 0.38);
  geoCache.set(kind, g);
  return g;
}

export const lavaMat = swayMaterial(0, 0, { emissive: 0xff4a10, emi: 0.5, rough: 0.8 });
const matCache = new Map<VegKind, THREE.Material>();
const SWAY: Record<VegKind, [number, number]> = {
  palm: [0.0045, 1], pine: [0.0016, 0.6], snowpine: [0.0016, 0.6], oak: [0.0035, 1], birch: [0.0045, 1], acacia: [0.003, 0.8], cactus: [0.0004, 0],
  bush: [0.05, 0.8], rock: [0, 0], lavarock: [0, 0], deadtree: [0.001, 0], reed: [0.06, 0.4], crystal: [0, 0], sakura: [0.0035, 1], mushroom: [0.01, 0], log: [0, 0],
};
export function vegMaterial(kind: VegKind): THREE.Material {
  if (kind === "lavarock") return lavaMat;
  let m = matCache.get(kind);
  if (!m) {
    const [a, f] = SWAY[kind];
    if (kind === "crystal") m = swayMaterial(0, 0, { emissive: 0x5a3cff, emi: 0.55, rough: 0.25, metal: 0.3 });
    else if (kind === "rock") m = swayMaterial(0, 0, { rough: 0.97 });
    else m = swayMaterial(a, f);
    matCache.set(kind, m);
  }
  return m;
}

const COLLIDE_R: Partial<Record<VegKind, number>> = { palm: 0.45, pine: 0.55, snowpine: 0.55, oak: 0.7, birch: 0.35, acacia: 0.5, cactus: 0.55, deadtree: 0.35, sakura: 0.6, crystal: 0.8, mushroom: 0.45, log: 0.9 };

export function buildIslandVegetation(isl: IslandData) {
  const b = isl.biome;
  const seed = isl.def.seed;
  const group = isl.vegGroup;
  group.position.set(0, 0, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  b.veg.forEach((spec, si) => {
    const rng = mulberry32(seed + si * 131 + 7);
    const mats: number[] = [];
    const attempts = spec.n * 4;
    for (let a = 0; a < attempts && mats.length / 16 < spec.n; a++) {
      const ang = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * 0.98;
      const lx = Math.cos(ang) * rr * ISLAND_A;
      const lz = Math.sin(ang) * rr * ISLAND_B;
      const h = isl.heightLocal(lx, lz);
      if (h < spec.minH || h > spec.maxH) continue;
      if (spec.cluster > 0) {
        const n = fbm(lx * 0.011 + si * 9, lz * 0.011, 3, seed + si * 13);
        if (n < 0.2 + spec.cluster * 0.5) continue;
      }
      const isRock = spec.kind === "rock" || spec.kind === "lavarock";
      if (!isRock && isl.slopeLocal(lx, lz) > 0.62) continue;
      const s = spec.s[0] + rng() * (spec.s[1] - spec.s[0]);
      dummy.position.set(lx, h - (isRock ? 0.25 * s : 0.12), lz);
      dummy.rotation.set(isRock ? rng() * 0.5 : (rng() - 0.5) * 0.08, rng() * Math.PI * 2, isRock ? rng() * 0.5 : (rng() - 0.5) * 0.08);
      const ys = s * (0.85 + rng() * 0.35);
      dummy.scale.set(s, ys, s * (isRock ? 0.7 + rng() * 0.6 : 1));
      dummy.updateMatrix();
      const col = rng();
      mats.push(...dummy.matrix.elements, col);
      // pack colour factor separately below
      const wx = lx + isl.def.cx;
      const wz = lz + isl.def.cz;
      const cr = COLLIDE_R[spec.kind];
      if (cr) isl.addCollider(wx, wz, cr * s);
      else if (isRock) isl.addCollider(wx, wz, 0.9 * s);
    }
    // each entry is 17 numbers (16 matrix + colour factor)
    const stride = 17;
    const count = Math.floor(mats.length / stride);
    if (count === 0) return;
    const mesh = new THREE.InstancedMesh(vegGeometry(spec.kind), vegMaterial(spec.kind), count);
    cA.setHex(spec.tint[0]);
    cB.setHex(spec.tint[1]);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      m4.fromArray(mats, i * stride);
      mesh.setMatrixAt(i, m4);
      color.copy(cA).lerp(cB, mats[i * stride + 16]);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = spec.kind === "rock";
    mesh.computeBoundingSphere();
    group.add(mesh);
  });
  isl.vegBuilt = true;
}

export class GrassField {
  mesh: THREE.InstancedMesh;
  N = 20000;
  lastX = 1e9;
  lastZ = 1e9;
  mat: THREE.MeshStandardMaterial;

  constructor() {
    const g = new THREE.BufferGeometry();
    const w = 0.055;
    const verts = [-w, 0, 0, w, 0, 0, -w * 0.62, 0.5, 0, w * 0.62, 0.5, 0, 0.0, 1, 0.0];
    const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4];
    const cols = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 1.15, 1.15, 1.15];
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0.2, 0, 1, 0.2, 0, 1, 0.2, 0, 1, 0.2, 0, 1, 0.2], 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(10), 2));
    g.setIndex(idx);
    this.mat = swayMaterial(0.5, 0, { rough: 1 });
    this.mesh = new THREE.InstancedMesh(g, this.mat, this.N);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(px: number, pz: number, world: World, force = false) {
    if (!force && Math.abs(px - this.lastX) < 3 && Math.abs(pz - this.lastZ) < 3) return;
    this.lastX = px;
    this.lastZ = pz;
    const R = 44;
    const cell = 1.6;
    const i0 = Math.floor((px - R) / cell);
    const i1 = Math.floor((px + R) / cell);
    const k0 = Math.floor((pz - R) / cell);
    const k1 = Math.floor((pz + R) / cell);
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const cA = new THREE.Color();
    const cB = new THREE.Color();
    let n = 0;
    const ic = this.mesh.instanceColor!;
    for (let ix = i0; ix <= i1 && n < this.N - 8; ix++) {
      for (let iz = k0; iz <= k1 && n < this.N - 8; iz++) {
        const wx = (ix + 0.5) * cell;
        const wz = (iz + 0.5) * cell;
        const dx = wx - px;
        const dz = wz - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const isl = world.landIslandAt(wx, wz);
        if (isl < 0) continue;
        const I = world.islands[isl];
        const b = I.biome;
        const y = world.groundHeight(wx, wz);
        if (y < 2.3) continue;
        const patch = vnoise(wx * 0.03, wz * 0.03, 3);
        const dens = b.grassDensity * (0.35 + patch * 0.9);
        if (b.snowLine < 900 && y > b.snowLine + 4 && hash2(ix, iz, 3) > 0.12) continue;
        const cnt = Math.floor(dens * 7 + hash2(ix, iz, 1));
        if (cnt <= 0) continue;
        const dist = Math.sqrt(d2);
        const fade = 1 - smoothstep(R * 0.65, R, dist);
        cA.setHex(b.grassA);
        cB.setHex(b.grassB);
        for (let k = 0; k < cnt && n < this.N; k++) {
          const ox = hash2(ix * 7 + k, iz * 3, 11) * cell;
          const oz = hash2(ix * 5, iz * 11 + k, 13) * cell;
          const px2 = ix * cell + ox;
          const pz2 = iz * cell + oz;
          const gy = k === 0 ? y : world.groundHeight(px2, pz2);
          if (gy < 2.2) continue;
          const hh = b.grassH * (0.65 + hash2(ix + k, iz, 17) * 0.9) * fade;
          pos.set(px2, gy - 0.03, pz2);
          eu.set((hash2(ix, iz + k, 19) - 0.5) * 0.4, hash2(ix + k, iz, 23) * 6.28, (hash2(ix, iz, 29 + k) - 0.5) * 0.4);
          q.setFromEuler(eu);
          sc.set(1 + hash2(ix, iz, 31 + k) * 0.8, hh, 1);
          m4.compose(pos, q, sc);
          this.mesh.setMatrixAt(n, m4);
          col.copy(cA).lerp(cB, hash2(ix * 3 + k, iz, 37) * 0.7 + patch * 0.3);
          ic.setXYZ(n, col.r, col.g, col.b);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    ic.needsUpdate = true;
  }
}
