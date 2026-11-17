import * as THREE from "three";
import { BIOMES, ISLANDS, ISLAND_A, ISLAND_B, type BiomeDef, type IslandDef } from "./data";
import { clamp, fbm, lerp, mulberry32, ridged, smoothstep } from "./noise";

export const HX = 480;
export const HZ = 832;
export const CELL = 8;
export const NX = (HX * 2) / CELL + 1; // 121
export const NZ = (HZ * 2) / CELL + 1; // 209
export const DEEP = new THREE.Color(0.012, 0.075, 0.13);

const tmpC = new THREE.Color();
const palCache = new Map<number, THREE.Color>();
function pal(hex: number): THREE.Color {
  let c = palCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    palCache.set(hex, c);
  }
  return c;
}

export class IslandData {
  def: IslandDef;
  biome: BiomeDef;
  hm!: Float32Array;
  ready = false;
  peakX = 0;
  peakZ = 0;
  peakH = 0;
  colliders = new Map<number, number[]>();
  group = new THREE.Group();
  hi: THREE.Mesh | null = null;
  lo: THREE.Mesh | null = null;
  built = false;
  vegBuilt = false;
  vegGroup = new THREE.Group();
  lavaY = 0;

  constructor(def: IslandDef) {
    this.def = def;
    this.biome = BIOMES[def.biome];
  }

  rawHeight(lx: number, lz: number): number {
    const b = this.biome;
    const seed = this.def.seed;
    const nxn = lx / ISLAND_A;
    const nzn = lz / ISLAND_B;
    const r = Math.sqrt(nxn * nxn + nzn * nzn);
    const warp = (fbm(lx * 0.0035 + seed * 0.013, lz * 0.0035, 4, seed) - 0.5) * 0.52 + (fbm(lx * 0.012, lz * 0.012, 3, seed + 5) - 0.5) * 0.12;
    const m = 1 - r + warp;
    let h: number;
    if (m < 0.12) {
      h = (m - 0.12) * 60 + (m < 0 ? m * 120 : 0);
    } else {
      h = 6 * smoothstep(0.12, 0.32, m);
    }
    const inl = smoothstep(0.14, 0.55, m);
    const t1 = fbm(lx * 0.004, lz * 0.004, 5, seed + 3);
    const t2 = ridged(lx * 0.003, lz * 0.003, 4, seed + 9);
    const shape = b.shape;
    let t = 0.55 * t1 + 0.45 * t2;
    if (shape === "alpine") t = 0.3 * t1 + 0.7 * t2;
    const term = Math.max(t - 0.28, -0.03);
    h += b.relief * 1.4 * inl * term;

    if (shape === "volcano") {
      const dv = Math.hypot(lx / 270, (lz + 40) / 270);
      h += 230 * Math.exp(-dv * dv * 0.9) * smoothstep(0.1, 0.4, m);
      h -= 120 * Math.exp(-Math.pow(dv / 0.35, 4));
    } else if (shape === "alpine") {
      const dv = Math.hypot(lx / 210, (lz - 60) / 330);
      h += 150 * Math.exp(-dv * dv * 1.1) * smoothstep(0.12, 0.45, m);
    } else if (shape === "dunes") {
      const d = fbm(lx * 0.01, lz * 0.01, 3, seed + 21) * 6.28;
      h += (1 - Math.abs(Math.sin((lx * 0.6 + lz * 0.8) * 0.02 + d * 3))) * 9 * inl;
    } else if (shape === "canyon") {
      const q = h / 16;
      const f = Math.floor(q);
      const ter = (f + smoothstep(0.72, 1, q - f)) * 16;
      h = lerp(h, ter, inl);
      const carve = 1 - Math.abs(fbm(lx * 0.006, lz * 0.006, 3, seed + 41) * 2 - 1);
      h -= 26 * Math.pow(carve, 8) * inl;
      h = Math.max(h, m > 0.2 ? 2 : h);
    } else if (shape === "swamp") {
      const k = smoothstep(0.12, 0.26, m);
      const sw = 0.55 + (fbm(lx * 0.018, lz * 0.018, 4, seed + 13) - 0.42) * 5.5;
      h = lerp(h, sw + b.relief * 0.2 * term, k);
    } else if (shape === "atoll") {
      const ring = smoothstep(0.12, 0.2, m) * (1 - smoothstep(0.5, 0.62, m));
      const lagoon = -2.4 - 3 * smoothstep(0.55, 0.85, m);
      const land = 1.8 + 5 * fbm(lx * 0.01, lz * 0.01, 3, seed + 2) + 6 * inl * term * 2;
      h = m < 0.12 ? h : lerp(lagoon, land, ring);
    }
    return h;
  }

  generate() {
    if (this.ready) return;
    const hm = new Float32Array(NX * NZ);
    let maxH = -1e9;
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const lx = -HX + i * CELL;
        const lz = -HZ + j * CELL;
        const h = this.rawHeight(lx, lz);
        hm[j * NX + i] = h;
        if (h > maxH) {
          maxH = h;
          this.peakX = lx;
          this.peakZ = lz;
        }
      }
    }
    this.hm = hm;
    this.peakH = maxH;
    this.lavaY = 0;
    this.ready = true;
    if (this.biome.shape === "volcano") {
      // find crater floor height
      this.lavaY = this.heightLocal(0, -40) + 4;
    }
  }

  heightLocal(lx: number, lz: number): number {
    const fx = (lx + HX) / CELL;
    const fz = (lz + HZ) / CELL;
    let ix = Math.floor(fx);
    let iz = Math.floor(fz);
    if (ix < 0) ix = 0;
    if (iz < 0) iz = 0;
    if (ix > NX - 2) ix = NX - 2;
    if (iz > NZ - 2) iz = NZ - 2;
    const tx = clamp(fx - ix, 0, 1);
    const tz = clamp(fz - iz, 0, 1);
    const hm = this.hm;
    const a = hm[iz * NX + ix];
    const b = hm[iz * NX + ix + 1];
    const c = hm[(iz + 1) * NX + ix];
    const d = hm[(iz + 1) * NX + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  slopeLocal(lx: number, lz: number): number {
    const e = 3;
    const dx = this.heightLocal(lx + e, lz) - this.heightLocal(lx - e, lz);
    const dz = this.heightLocal(lx, lz + e) - this.heightLocal(lx, lz - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  colorAt(h: number, slope: number, lx: number, lz: number, out: THREE.Color) {
    const b = this.biome;
    const seed = this.def.seed;
    const n1 = fbm(lx * 0.06, lz * 0.06, 3, seed + 1);
    const n2 = fbm(lx * 0.012, lz * 0.012, 3, seed + 3);
    if (h < 0) {
      const d = -h;
      const sandC = pal(b.sand);
      // shallow tropical turquoise
      tmpC.setRGB(0.05, 0.42, 0.45);
      out.copy(sandC).multiplyScalar(0.8).lerp(tmpC, smoothstep(0, 2.2, d));
      tmpC.setRGB(0.02, 0.18, 0.28);
      out.lerp(tmpC, smoothstep(2, 7, d));
      out.lerp(DEEP, smoothstep(6, 16, d));
      return;
    }
    const sand = pal(b.sand);
    const grass = tmpC.copy(pal(b.grassA)).lerp(pal(b.grassB), n2);
    const gm = smoothstep(2.0 + n1 * 1.4, 4.2 + n1 * 1.5, h);
    out.copy(sand).multiplyScalar(0.92 + n1 * 0.16);
    if (h < 0.9) out.multiplyScalar(0.72 + h * 0.3);
    out.lerp(grass, gm);
    const hi = clamp((h - b.relief * 0.55) / (b.relief * 0.7 + 1), 0, 1);
    if (hi > 0) out.lerp(pal(b.high), hi * 0.7 * gm);
    const rm = smoothstep(0.45, 0.95, slope + (n1 - 0.5) * 0.25) * gm;
    out.lerp(pal(b.rock), rm);
    if (b.snowLine < 900) {
      const sm = smoothstep(b.snowLine, b.snowLine + 12, h + (n1 - 0.5) * 16) * (1 - smoothstep(0.8, 1.4, slope) * 0.7);
      tmpC.setRGB(0.88, 0.92, 0.98);
      out.lerp(tmpC, sm);
    }
    if (h < 0.3) {
      const f = 1 - Math.min(1, Math.abs(h - 0.1) / 0.4);
      out.lerp(tmpC.setRGB(0.9, 0.95, 0.95), f * 0.35);
    }
  }

  buildGeometry(step: number): THREE.BufferGeometry {
    const nx = (NX - 1) / step + 1;
    const nz = (NZ - 1) / step + 1;
    const pos = new Float32Array(nx * nz * 3);
    const nor = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const c = new THREE.Color();
    const e = CELL * step;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const lx = -HX + i * e;
        const lz = -HZ + j * e;
        const h = this.hm[j * step * NX + i * step];
        const hx1 = this.heightLocal(lx + e, lz);
        const hx0 = this.heightLocal(lx - e, lz);
        const hz1 = this.heightLocal(lx, lz + e);
        const hz0 = this.heightLocal(lx, lz - e);
        const nxv = hx0 - hx1;
        const nzv = hz0 - hz1;
        const ny = 2 * e;
        const len = Math.sqrt(nxv * nxv + ny * ny + nzv * nzv);
        const k = (j * nx + i) * 3;
        pos[k] = lx;
        pos[k + 1] = h;
        pos[k + 2] = lz;
        nor[k] = nxv / len;
        nor[k + 1] = ny / len;
        nor[k + 2] = nzv / len;
        const slope = Math.sqrt((hx1 - hx0) ** 2 + (hz1 - hz0) ** 2) / (2 * e);
        this.colorAt(h, slope, lx, lz, c);
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
        const u = (j * nx + i) * 2;
        uv[u] = (lx + this.def.cx) / 5;
        uv[u + 1] = (lz + this.def.cz) / 5;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const cc = a + nx;
        const d = cc + 1;
        idx[q++] = a; idx[q++] = cc; idx[q++] = b;
        idx[q++] = b; idx[q++] = cc; idx[q++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  addCollider(x: number, z: number, r: number) {
    const key = ckey(Math.floor(x / 16), Math.floor(z / 16));
    let arr = this.colliders.get(key);
    if (!arr) {
      arr = [];
      this.colliders.set(key, arr);
    }
    arr.push(x, z, r);
  }

  /** world coordinates random land point */
  randomLand(rng: () => number, opts: { minH?: number; maxH?: number; maxSlope?: number; spread?: number } = {}) {
    const minH = opts.minH ?? 2.5;
    const maxH = opts.maxH ?? 60;
    const maxSlope = opts.maxSlope ?? 0.5;
    const spread = opts.spread ?? 0.82;
    for (let n = 0; n < 700; n++) {
      const relax = n > 250;
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng()) * spread;
      const lx = Math.cos(a) * rr * ISLAND_A;
      const lz = Math.sin(a) * rr * ISLAND_B;
      const h = this.heightLocal(lx, lz);
      if (h < (relax ? Math.min(minH, 1.3) : minH) || h > maxH) continue;
      if (this.slopeLocal(lx, lz) > (relax ? maxSlope * 2 : maxSlope)) continue;
      return { x: lx + this.def.cx, z: lz + this.def.cz, y: h };
    }
    // fallback: peak side
    const lx = ISLAND_A * 0.1;
    const lz = 0;
    return { x: lx + this.def.cx, z: lz + this.def.cz, y: this.heightLocal(lx, lz) };
  }
}

const ckey = (cx: number, cz: number) => (cx + 4000) * 10000 + (cz + 4000);

export class World {
  islands: IslandData[] = ISLANDS.map((d) => new IslandData(d));
  private last = 0;

  islandIndexAt(wx: number, wz: number): number {
    for (let k = 0; k < this.islands.length; k++) {
      const i = (k + this.last) % this.islands.length;
      const isl = this.islands[i];
      const lx = wx - isl.def.cx;
      const lz = wz - isl.def.cz;
      if (Math.abs(lx) < HX - 2 && Math.abs(lz) < HZ - 2) {
        this.last = i;
        return i;
      }
    }
    return -1;
  }

  /** island whose ellipse contains the point, or -1 */
  landIslandAt(wx: number, wz: number): number {
    const i = this.islandIndexAt(wx, wz);
    if (i < 0) return -1;
    const isl = this.islands[i];
    const lx = (wx - isl.def.cx) / ISLAND_A;
    const lz = (wz - isl.def.cz) / ISLAND_B;
    return lx * lx + lz * lz < 1.15 ? i : -1;
  }

  groundHeight(wx: number, wz: number): number {
    const i = this.islandIndexAt(wx, wz);
    if (i < 0) return -60;
    const isl = this.islands[i];
    if (!isl.ready) isl.generate();
    return isl.heightLocal(wx - isl.def.cx, wz - isl.def.cz);
  }

  slopeAt(wx: number, wz: number): number {
    const e = 2;
    const dx = this.groundHeight(wx + e, wz) - this.groundHeight(wx - e, wz);
    const dz = this.groundHeight(wx, wz + e) - this.groundHeight(wx, wz - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  /** push circle out of tree/rock colliders */
  collide(x: number, z: number, r: number): [number, number] {
    const i = this.landIslandAt(x, z);
    if (i < 0) return [x, z];
    const isl = this.islands[i];
    if (isl.colliders.size === 0) return [x, z];
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const arr = isl.colliders.get(ckey(cx + a, cz + b));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 3) {
          const dx = x - arr[k];
          const dz = z - arr[k + 1];
          const rr = r + arr[k + 2];
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 0.001;
            x = arr[k] + (dx / d) * rr;
            z = arr[k + 1] + (dz / d) * rr;
          }
        }
      }
    }
    return [x, z];
  }
}

export function makeDetailTexture(): THREE.Texture {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(77);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.06, y * 0.06, 3, 11) * 0.55 + rng() * 0.35 + fbm(x * 0.3, y * 0.3, 2, 5) * 0.2;
      const v = Math.floor(clamp(150 + n * 105, 0, 255));
      const k = (y * size + x) * 4;
      img.data[k] = v;
      img.data[k + 1] = v;
      img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
