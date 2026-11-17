import * as THREE from "three";
import type { Weather } from "./data";

const PARTICLE_VS = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.5, -mv.z);
}`;
const PARTICLE_FS = `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vColor.a * smoothstep(1.0, 0.25, d);
  if (a < 0.005) discard;
  gl_FragColor = vec4(vColor.rgb, a);
  #include <colorspace_fragment>
}`;

export const pointScale = { value: 800 };

export class Particles {
  points: THREE.Points;
  max: number;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  c0: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  cursor = 0;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      uniforms: { uScale: pointScale },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 4] = r; this.c0[i * 4 + 1] = g; this.c0[i * 4 + 2] = b; this.c0[i * 4 + 3] = a;
    this.grav[i] = grav; this.drag[i] = drag;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l <= 0) {
        this.size[i] = 0;
        continue;
      }
      l -= dt;
      this.life[i] = l;
      if (l <= 0) {
        this.size[i] = 0;
        continue;
      }
      const t = 1 - l / this.maxLife[i];
      const k = 1 - Math.min(0.98, this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4] = this.c0[i * 4];
      this.col[i * 4 + 1] = this.c0[i * 4 + 1];
      this.col[i * 4 + 2] = this.c0[i * 4 + 2];
      const fadeIn = Math.min(1, t * 8);
      this.col[i * 4 + 3] = this.c0[i * 4 + 3] * (1 - t) * fadeIn;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
  }
}

const WEATHER_VS = `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uVel;
uniform float uSize;
uniform float uSway;
uniform float uAmt;
uniform float uScale;
uniform float uTwinkle;
uniform float uBaseAlpha;
varying float vA;
void main() {
  vec3 p = aSeed.xyz * uBox + uVel * uTime;
  p.x += sin(uTime * 0.7 + aSeed.x * 40.0) * uSway;
  p.z += cos(uTime * 0.6 + aSeed.z * 40.0) * uSway;
  p.y += sin(uTime * 0.9 + aSeed.y * 30.0) * uSway * 0.4;
  vec3 rel = mod(p - uCam, uBox);
  vec3 wp = uCam + rel - uBox * 0.5;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = min(min(rel.x, uBox.x - rel.x), min(rel.z, uBox.z - rel.z));
  float fade = smoothstep(0.0, 8.0, edge) * smoothstep(0.0, 5.0, min(rel.y, uBox.y - rel.y));
  float on = step(aSeed.w, uAmt);
  float tw = mix(1.0, 0.5 + 0.5 * sin(uTime * 3.0 + aSeed.x * 60.0), uTwinkle);
  vA = fade * on * tw * uBaseAlpha;
  gl_PointSize = max(1.2, uSize * uScale / max(0.5, -mv.z)) * on;
}`;
const WEATHER_FS = `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = vA * smoothstep(1.0, 0.3, d);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

interface WCfg { vel: [number, number, number]; size: number; color: [number, number, number]; alpha: number; sway: number; }
const WCFG: Record<Weather, WCfg> = {
  none: { vel: [0, 0, 0], size: 0.1, color: [1, 1, 1], alpha: 0, sway: 0 },
  snow: { vel: [1.6, -1.7, 0.7], size: 0.1, color: [1, 1, 1], alpha: 0.9, sway: 1.0 },
  rain: { vel: [-2.5, -24, -1], size: 0.05, color: [0.7, 0.8, 0.95], alpha: 0.55, sway: 0.0 },
  ash: { vel: [1.8, -0.8, 0.9], size: 0.09, color: [0.3, 0.27, 0.25], alpha: 0.8, sway: 0.8 },
  petals: { vel: [1.8, -0.9, 0.7], size: 0.14, color: [1, 0.72, 0.84], alpha: 0.95, sway: 1.4 },
  sand: { vel: [10, -0.1, 3.5], size: 0.07, color: [0.92, 0.76, 0.5], alpha: 0.4, sway: 0.3 },
  leaves: { vel: [1.8, -1.2, 0.6], size: 0.16, color: [0.88, 0.45, 0.12], alpha: 0.95, sway: 1.8 },
  spores: { vel: [0.1, 0.4, 0.1], size: 0.12, color: [0.6, 0.85, 1], alpha: 0.9, sway: 1.2 },
};

export class WeatherField {
  points: THREE.Points;
  u: Record<string, THREE.IUniform>;
  amt = 0;
  type: Weather = "none";
  constructor(n: number, additive: boolean, box: [number, number, number]) {
    const seeds = new Float32Array(n * 4);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 4; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.u = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(box[0], box[1], box[2]) },
      uVel: { value: new THREE.Vector3() },
      uSize: { value: 0.1 },
      uSway: { value: 0 },
      uAmt: { value: 0 },
      uScale: pointScale,
      uTwinkle: { value: 0 },
      uBaseAlpha: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) },
    };
    const m = new THREE.ShaderMaterial({ vertexShader: WEATHER_VS, fragmentShader: WEATHER_FS, uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }

  setType(t: Weather) {
    this.type = t;
    const c = WCFG[t];
    (this.u.uVel.value as THREE.Vector3).set(c.vel[0], c.vel[1], c.vel[2]);
    this.u.uSize.value = c.size;
    this.u.uSway.value = c.sway;
    this.u.uBaseAlpha.value = c.alpha;
    (this.u.uColor.value as THREE.Color).setRGB(c.color[0], c.color[1], c.color[2]);
  }

  update(time: number, cam: THREE.Vector3, targetAmt: number, dt: number) {
    this.amt += (targetAmt - this.amt) * Math.min(1, dt * 0.8);
    this.u.uTime.value = time;
    (this.u.uCam.value as THREE.Vector3).copy(cam);
    this.u.uAmt.value = this.amt;
  }
}

export class Tracers {
  lines: THREE.LineSegments;
  n = 96;
  pos: Float32Array;
  col: Float32Array;
  life: Float32Array;
  data: Float32Array;
  cursor = 0;
  constructor() {
    this.pos = new Float32Array(this.n * 6);
    this.col = new Float32Array(this.n * 6);
    this.life = new Float32Array(this.n);
    this.data = new Float32Array(this.n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
  }
  add(a: THREE.Vector3, b: THREE.Vector3, r = 1, g = 0.85, bl = 0.45) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    // short streak toward the target: visible head segment
    const dir = b.clone().sub(a);
    const len = dir.length();
    const head = Math.min(len, 22);
    dir.normalize();
    const s = a.clone().addScaledVector(dir, Math.max(0, len - head));
    this.pos.set([s.x, s.y, s.z, b.x, b.y, b.z], i * 6);
    this.data[i * 3] = r; this.data[i * 3 + 1] = g; this.data[i * 3 + 2] = bl;
    this.life[i] = 0.09;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      let l = this.life[i];
      if (l > 0) l -= dt;
      this.life[i] = l;
      const k = Math.max(0, l / 0.09);
      this.col[i * 6] = this.data[i * 3] * k * 0;
      this.col[i * 6 + 1] = this.data[i * 3 + 1] * k * 0;
      this.col[i * 6 + 2] = this.data[i * 3 + 2] * k * 0;
      this.col[i * 6 + 3] = this.data[i * 3] * k;
      this.col[i * 6 + 4] = this.data[i * 3 + 1] * k;
      this.col[i * 6 + 5] = this.data[i * 3 + 2] * k;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}

export function softSpriteTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
