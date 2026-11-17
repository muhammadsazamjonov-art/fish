import * as THREE from "three";
import { ISLANDS } from "./data";
import { buildHumanoid, buildShip, type Humanoid, type Ship } from "./entities";
import { waveHeight } from "./environment";
import type { Game } from "./engine";
import { ownerColor } from "./islands";

interface RemoteState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  mode: string;
  sx: number;
  sz: number;
  syaw: number;
  island: number;
}

interface Remote {
  st: RemoteState;
  hum: Humanoid;
  ship: Ship | null;
  label: THREE.Sprite;
  pos: THREE.Vector3;
  yaw: number;
  spos: THREE.Vector3;
  syaw: number;
  seen: number;
  group: THREE.Group;
}

function makeLabel(text: string, color: number) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext("2d")!;
  ctx.font = "bold 30px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(8, 8, 240, 48);
  ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
  ctx.fillText(text.slice(0, 14), 128, 43);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(4, 1, 1);
  return s;
}

export class MP {
  g: Game;
  room: string | null = null;
  id: string;
  connected = false;
  remotes = new Map<string, Remote>();
  owners = new Map<number, string>();
  chat: { name: string; text: string }[] = [];
  lastChatId = 0;
  pendingChat: string | null = null;
  pendingCapture: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight = false;

  constructor(g: Game) {
    this.g = g;
    this.id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  start(room: string | null) {
    const clean = (room ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
    if (!clean) return;
    this.room = clean;
    this.stop();
    this.timer = setInterval(() => void this.poll(), 220);
    void this.poll();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list() {
    return Array.from(this.remotes.values()).map((r) => ({ name: r.st.name, x: r.pos.x, z: r.pos.z, island: r.st.island }));
  }

  announceCapture(i: number) {
    this.pendingCapture = i;
    if (this.room && !this.owners.has(i)) this.owners.set(i, this.g.save.name);
  }

  sendChat(text: string) {
    const t = text.trim().slice(0, 140);
    if (!t) return;
    if (!this.room) {
      this.chat.push({ name: this.g.save.name, text: t });
      return;
    }
    this.pendingChat = t;
  }

  private async poll() {
    if (!this.room || this.inflight) return;
    this.inflight = true;
    const g = this.g;
    const p = g.player;
    const body = {
      room: this.room, id: this.id, name: g.save.name,
      x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, mode: p.mode,
      sx: g.ship.pos.x, sz: g.ship.pos.z, syaw: g.ship.yaw, island: g.curIsland,
      captured: this.pendingCapture, chat: this.pendingChat, since: this.lastChatId,
    };
    const cap = this.pendingCapture;
    const ch = this.pendingChat;
    this.pendingCapture = null;
    this.pendingChat = null;
    try {
      const res = await fetch("/api/mp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("bad");
      const data = (await res.json()) as { players: RemoteState[]; owners: { island: number; owner: string }[]; chat: { id: number; name: string; text: string }[] };
      this.connected = true;
      this.applyPlayers(data.players);
      for (const o of data.owners) this.owners.set(o.island, o.owner);
      for (const c of data.chat) {
        if (c.id > this.lastChatId) {
          this.lastChatId = c.id;
          this.chat.push({ name: c.name, text: c.text });
          if (this.chat.length > 30) this.chat.shift();
        }
      }
    } catch {
      this.connected = false;
      this.pendingCapture = cap ?? this.pendingCapture;
      this.pendingChat = ch ?? this.pendingChat;
    }
    this.inflight = false;
  }

  private applyPlayers(list: RemoteState[]) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const st of list) {
      seen.add(st.id);
      let r = this.remotes.get(st.id);
      if (!r) {
        const col = ownerColor(st.name);
        const hum = buildHumanoid({ shirt: col, pants: 0x2a2a30, hat: "pirate", hatColor: 0x151515, gun: true });
        const group = new THREE.Group();
        group.add(hum.group);
        const label = makeLabel(st.name, col);
        group.add(label);
        this.g.scene.add(group);
        r = { st, hum, ship: null, label, pos: new THREE.Vector3(st.x, st.y, st.z), yaw: st.yaw, spos: new THREE.Vector3(st.sx, 0, st.sz), syaw: st.syaw, seen: now, group };
        this.remotes.set(st.id, r);
        this.g.notify(`${st.name} o'yinga qo'shildi`);
      }
      r.st = st;
      r.seen = now;
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.g.scene.remove(r.group);
        if (r.ship) this.g.scene.remove(r.ship.group);
        this.remotes.delete(id);
        this.g.notify(`${r.st.name} chiqib ketdi`);
      }
    }
  }

  update(dt: number) {
    const g = this.g;
    const k = Math.min(1, dt * 7);
    for (const r of this.remotes.values()) {
      const st = r.st;
      const prev = r.pos.clone();
      r.pos.x += (st.x - r.pos.x) * k;
      r.pos.y += (st.y - r.pos.y) * k;
      r.pos.z += (st.z - r.pos.z) * k;
      let dy = st.yaw - r.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * k;
      r.spos.x += (st.sx - r.spos.x) * k;
      r.spos.z += (st.sz - r.spos.z) * k;
      let sdy = st.syaw - r.syaw;
      sdy = Math.atan2(Math.sin(sdy), Math.cos(sdy));
      r.syaw += sdy * k;
      const speed = prev.distanceTo(r.pos) / Math.max(dt, 0.001);
      const onShip = st.mode === "ship";
      r.hum.group.visible = !onShip;
      r.hum.group.position.copy(r.pos);
      r.hum.group.rotation.y = r.yaw + (0);
      r.hum.update(Math.min(speed, 8), dt, false, g.time);
      r.label.position.set(r.pos.x, r.pos.y + (onShip ? 30 : 2.5), r.pos.z);
      r.group.position.set(0, 0, 0);
      r.label.position.copy(onShip ? new THREE.Vector3(r.spos.x, 30, r.spos.z) : new THREE.Vector3(r.pos.x, r.pos.y + 2.5, r.pos.z));
      r.label.scale.setScalar(1);
      const dist = r.label.position.distanceTo(g.camera.position);
      r.label.scale.set(4 + dist * 0.02, 1 + dist * 0.005, 1);
      // ship
      if (!r.ship) {
        r.ship = buildShip({ sail: 0xf0e8d0, hull: 0x6a4a30, accent: ownerColor(st.name), flag: ownerColor(st.name) });
        g.scene.add(r.ship.group);
      }
      const sg = r.ship.group;
      const hc = waveHeight(r.spos.x, r.spos.z, g.time);
      sg.position.set(r.spos.x, hc * 0.85 - 0.15, r.spos.z);
      sg.rotation.set(0, r.syaw, 0);
      sg.visible = dist < 3000 || true;
      if (g.camera.position.distanceTo(sg.position) < 500) r.ship.update(g.time, 1);
    }
  }

  islandName(i: number) {
    return i >= 0 ? ISLANDS[i].name : "";
  }
}
