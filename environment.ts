import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { clamp, lerp, mulberry32, smoothstep } from "./noise";
import { DEEP } from "./world";

// [dirX, dirZ, frequency, amplitude, speed]
const WAVES: number[][] = [
  [0.8, 0.6, 0.045, 0.95, 1.1],
  [-0.5, 0.85, 0.08, 0.5, 1.5],
  [0.3, -0.95, 0.15, 0.24, 1.9],
  [0.95, -0.3, 0.27, 0.11, 2.6],
  [-0.7, -0.7, 0.5, 0.045, 3.4],
].map(([x, z, f, a, s]) => {
  const l = Math.hypot(x, z);
  return [x / l, z / l, f, a, s];
});

export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const [dx, dz, f, a, s] of WAVES) h += a * Math.sin(f * (dx * x + dz * z) + s * t);
  return h;
}

const waveGLSL = WAVES.map(([dx, dz, f, a, s]) => `{ float ph = ${f.toFixed(4)} * (${dx.toFixed(4)} * wp.x + ${dz.toFixed(4)} * wp.z) + ${s.toFixed(3)} * uTime; h += ${a.toFixed(3)} * sin(ph); float cc = cos(ph) * ${(a * f).toFixed(5)}; gx += cc * ${dx.toFixed(4)}; gz += cc * ${dz.toFixed(4)}; }`).join("\n");

const WATER_VS = `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = 0.0; float gx = 0.0; float gz = 0.0;
  ${waveGLSL}
  wp.y += h;
  vWorld = wp.xyz;
  vN = normalize(vec3(-gx, 1.0, -gz));
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const WATER_FS = `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uDay;
varying vec3 vWorld;
varying vec3 vN;
varying float vH;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 rn = vec3(
    sin(p.x * 1.7 + t * 1.3) * cos(p.y * 1.3 - t * 1.1) + 0.5 * sin(p.x * 3.9 - p.y * 2.7 + t * 2.1) + 0.3 * sin(p.x * 9.0 + p.y * 7.0 - t * 3.0),
    0.0,
    cos(p.y * 1.9 + t * 1.2) * sin(p.x * 1.1 + t * 0.9) + 0.5 * cos(p.y * 4.3 + p.x * 3.1 - t * 1.9) + 0.3 * cos(p.y * 8.0 - p.x * 6.0 + t * 2.6)
  ) * 0.03;
  vec3 N = normalize(vN + rn);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 4.5);
  vec3 body = mix(uDeep, uShallow, clamp(vH * 0.3 + 0.45, 0.0, 1.0) * 0.6);
  body *= (0.12 + 0.88 * uDay);
  vec3 col = mix(body, uSky, clamp(fres * 1.15, 0.0, 1.0));
  vec3 R = reflect(-uSunDir, N);
  float spec = pow(max(dot(R, V), 0.0), 140.0) + 0.25 * pow(max(dot(R, V), 0.0), 18.0);
  col += uSun * spec * 1.8;
  float cr = vH + sin(p.x * 2.3 + t) * sin(p.y * 2.1 - t * 0.8) * 0.1;
  float foam = smoothstep(0.62, 1.15, cr);
  col = mix(col, vec3(0.92, 0.96, 1.0) * (0.25 + 0.75 * uDay), foam * 0.5);
  float dist = length(cameraPosition - vWorld);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fogF);
  float alpha = mix(0.7, 0.97, clamp(fres * 1.4 + foam, 0.0, 1.0));
  alpha = mix(alpha, 1.0, fogF);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function ringGeometry(rings: number, segs: number, rMax: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const r = rMax * Math.pow(t, 2.4);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j;
      const b = a + segs + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), rMax * 2);
  return g;
}

function cloudTexture(): THREE.Texture {
  const s = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d")!;
  const rng = mulberry32(5);
  for (let i = 0; i < 38; i++) {
    const x = s * (0.2 + rng() * 0.6);
    const y = s * (0.3 + rng() * 0.4);
    const r = s * (0.1 + rng() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(0.55, "rgba(255,255,255,0.2)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: Sky;
  stars: THREE.Points;
  clouds: THREE.Sprite[] = [];
  cloudMat: THREE.SpriteMaterial;
  water: THREE.Mesh;
  floor: THREE.Mesh;
  waterU: Record<string, THREE.IUniform>;
  dayTime = 0.3;
  daylight = 1;
  elev = 0.8;
  sunDir = new THREE.Vector3(0.3, 0.8, 0.3);
  fogColor = new THREE.Color(0.62, 0.76, 0.88);
  fogBase = 0.00032;
  fogExtra = 0;
  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0xa0c0dc, this.fogBase);

    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a5a40, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.sky = new Sky();
    this.sky.scale.setScalar(18000);
    const u = this.sky.material.uniforms;
    u["turbidity"].value = 5;
    u["rayleigh"].value = 1.6;
    u["mieCoefficient"].value = 0.005;
    u["mieDirectionalG"].value = 0.82;
    scene.add(this.sky);

    const sp = new Float32Array(1800 * 3);
    const rng = mulberry32(99);
    for (let i = 0; i < 1800; i++) {
      const a = rng() * Math.PI * 2;
      const y = rng() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(a) * r * 14000;
      sp[i * 3 + 1] = y * 14000;
      sp[i * 3 + 2] = Math.sin(a) * r * 14000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 22, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    (this.stars.material as THREE.PointsMaterial).size = 1.8;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // clouds
    const tex = cloudTexture();
    this.cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
    const cr = mulberry32(31);
    for (let c = 0; c < 46; c++) {
      const bx = (cr() - 0.5) * 14000;
      const bz = (cr() - 0.5) * 14000;
      const by = 650 + cr() * 450;
      for (let k = 0; k < 5; k++) {
        const s = new THREE.Sprite(this.cloudMat);
        const w = 700 + cr() * 900;
        s.scale.set(w, w * 0.45, 1);
        s.position.set(bx + (cr() - 0.5) * 900, by + (cr() - 0.5) * 60, bz + (cr() - 0.5) * 700);
        this.clouds.push(s);
        scene.add(s);
      }
    }

    // ocean
    this.waterU = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0.01, 0.12, 0.2) },
      uShallow: { value: new THREE.Color(0.04, 0.33, 0.4) },
      uSky: { value: new THREE.Color(0.5, 0.65, 0.8) },
      uSun: { value: new THREE.Color(1, 0.95, 0.85) },
      uSunDir: { value: this.sunDir },
      uFogColor: { value: this.fogColor },
      uFogDensity: { value: this.fogBase },
      uDay: { value: 1 },
    };
    this.water = new THREE.Mesh(
      ringGeometry(150, 180, 12000),
      new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: this.waterU, transparent: true, depthWrite: false })
    );
    this.water.frustumCulled = false;
    this.water.renderOrder = 1;
    scene.add(this.water);

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(16000, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: DEEP, roughness: 1 }));
    this.floor.position.y = -45;
    this.floor.frustumCulled = false;
    scene.add(this.floor);
  }

  update(dt: number, time: number, cam: THREE.Camera, focus: THREE.Vector3, underwater: boolean) {
    this.dayTime = (this.dayTime + dt / 900) % 1; // 15 min cycle
    const e = Math.sin((this.dayTime - 0.25) * Math.PI * 2);
    this.elev = e;
    const el = e * 1.15;
    const az = this.dayTime * Math.PI * 2 * 0.5 + 0.8;
    this.sunDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    this.daylight = smoothstep(-0.12, 0.25, e);
    const night = 1 - this.daylight;
    const dusk = 1 - clamp(Math.abs(e) * 3.2, 0, 1);

    const u = this.sky.material.uniforms;
    u["sunPosition"].value.copy(this.sunDir);
    u["rayleigh"].value = lerp(0.35, 1.7, this.daylight) + dusk * 1.2;
    this.sky.position.copy(cam.position);

    // light
    const sunI = 3.1 * smoothstep(-0.02, 0.3, e);
    const moonI = 0.45 * smoothstep(0.02, -0.2, e);
    if (e > -0.04) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
      this.sun.intensity = sunI;
      this.sun.color.setRGB(1, 0.62 + 0.36 * (1 - dusk), 0.4 + 0.5 * (1 - dusk));
    } else {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, -300);
      this.sun.intensity = moonI;
      this.sun.color.setRGB(0.5, 0.62, 1);
    }
    const snap = 200 / 2048;
    this.sun.target.position.set(Math.round(focus.x / snap) * snap, focus.y, Math.round(focus.z / snap) * snap);
    this.sun.position.x += this.sun.target.position.x - focus.x;
    this.sun.position.z += this.sun.target.position.z - focus.z;
    this.hemi.intensity = 0.1 + 0.62 * this.daylight;
    this.hemi.color.setRGB(0.55 + 0.2 * this.daylight, 0.65 + 0.2 * this.daylight, 0.9);
    this.hemi.groundColor.setRGB(0.28, 0.27, 0.2).multiplyScalar(0.3 + 0.7 * this.daylight);

    // fog
    const dayFog = this.tmp.setRGB(0.62, 0.76, 0.9);
    this.fogColor.setRGB(0.012, 0.022, 0.05).lerp(dayFog, this.daylight);
    this.fogColor.lerp(this.tmp.setRGB(0.95, 0.62, 0.42), dusk * 0.55 * this.daylight);
    const fog = this.scene.fog as THREE.FogExp2;
    if (underwater) {
      fog.color.setRGB(0.03, 0.25, 0.3).multiplyScalar(0.3 + 0.7 * this.daylight);
      fog.density = 0.05;
    } else {
      fog.color.copy(this.fogColor);
      fog.density = this.fogBase + this.fogExtra;
    }

    // water
    const wu = this.waterU;
    wu.uTime.value = time;
    wu.uDay.value = this.daylight;
    (wu.uSky.value as THREE.Color).setRGB(0.4, 0.58, 0.8).lerp(this.fogColor, 0.35).multiplyScalar(0.12 + 0.88 * this.daylight);
    (wu.uSun.value as THREE.Color).copy(this.sun.color).multiplyScalar(e > 0 ? 1 : 0.2);
    wu.uFogDensity.value = fog.density;
    this.water.position.set(cam.position.x, 0, cam.position.z);
    this.floor.position.x = cam.position.x;
    this.floor.position.z = cam.position.z;
    (this.floor.material as THREE.MeshStandardMaterial).color.copy(DEEP);

    // stars
    (this.stars.material as THREE.PointsMaterial).opacity = clamp(night * 1.2 - 0.1, 0, 1);
    this.stars.position.copy(cam.position);

    // clouds drift
    this.cloudMat.color.setRGB(0.12, 0.14, 0.2).lerp(this.tmp.setRGB(1, 1, 1), this.daylight).lerp(this.tmp.setRGB(1, 0.72, 0.58), dusk * 0.5);
    this.cloudMat.opacity = 0.88;
    const cx = cam.position.x;
    const cz = cam.position.z;
    for (const s of this.clouds) {
      s.position.x += dt * 9;
      s.position.z += dt * 3;
      if (s.position.x - cx > 7500) s.position.x -= 15000;
      if (s.position.x - cx < -7500) s.position.x += 15000;
      if (s.position.z - cz > 7500) s.position.z -= 15000;
      if (s.position.z - cz < -7500) s.position.z += 15000;
    }
  }
}
