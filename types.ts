import type * as THREE from "three";
import type { AnimalKind } from "./data";
import type { Humanoid, Quadruped, Ship, Cloth } from "./entities";

export type Faction = "enemy" | "ally" | "wild";
export type MobType = "raider" | "brute" | "boss" | "wolf" | "soldier" | "animal" | "prisoner";
export type Tag = "mission" | "camp" | "ambient" | "wave" | null;

export interface Mob {
  id: number;
  type: MobType;
  faction: Faction;
  hum: Humanoid | null;
  quad: Quadruped | null;
  group: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  range: number;
  cd: number;
  fireRate: number;
  alert: number;
  home: THREE.Vector3;
  wanderT: number;
  wanderYaw: number;
  island: number;
  dead: boolean;
  deadT: number;
  tag: Tag;
  campIdx: number;
  h: number;
  r: number;
  onDeck: boolean;
  slot: number;
  animal: AnimalKind | null;
  breathT: number;
  curSpeed: number;
  gold: number;
  fleeT: number;
  aiming: boolean;
  caged: boolean;
  cageIdx: number;
}

export interface Tower {
  kind: "cannon" | "totem";
  pos: THREE.Vector3;
  obj: THREE.Object3D;
  hp: number;
  maxHp: number;
  cd: number;
  dead: boolean;
  island: number;
  spot: number;
  r: number;
  h: number;
  deadT: number;
}

export interface EShip {
  ship: Ship;
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  hp: number;
  maxHp: number;
  cd: number;
  mission: boolean;
  island: number;
  sinking: number;
  anchor: THREE.Vector3;
  dead: boolean;
  r: number;
  h: number;
  orbit: number;
  orbitDir: number;
}

export interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  owner: "player" | "enemy";
  dmg: number;
  splash: number;
  life: number;
}

export interface MItem {
  pos: THREE.Vector3;
  taken: boolean;
  obj: THREE.Object3D | null;
  beam: THREE.Object3D | null;
  mob: Mob | null;
  tower: Tower | null;
  lit: boolean;
}

export interface Camp {
  x: number;
  z: number;
  n: number;
  dead: number;
  looted: boolean;
  obj: THREE.Group[];
  fire: THREE.Object3D | null;
  chest: THREE.Object3D | null;
}

export interface MissionRT {
  done: number;
  complete: boolean;
  started: boolean;
  timer: number;
  waveT: number;
  wave: number;
  warn: number;
  spots: THREE.Vector3[];
  taken: boolean[];
  items: MItem[];
  eshipsSpawned: boolean;
  bossSpoken: boolean;
  outside: number;
}

export interface IslandRT {
  idx: number;
  active: boolean;
  camps: Camp[];
  campsMade: boolean;
  objs: THREE.Object3D[];
  mission: MissionRT;
  cloths: Cloth[];
  fires: { pos: THREE.Vector3; node: THREE.Object3D | null }[];
  flagCloth: Cloth | null;
  flagObj: THREE.Object3D | null;
  lighthouse: THREE.Object3D | null;
  lava: THREE.Mesh | null;
  animalsSpawned: boolean;
}

export interface HudMission {
  title: string;
  desc: string;
  progress: number;
  target: number;
  noun: string;
  island: string;
  dist: number;
  bearing: number;
  timeLeft: number | null;
  complete: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  armor: number;
  ammo: number;
  mag: number;
  reloading: boolean;
  weapon: string;
  weaponId: number;
  gold: number;
  soldiers: number;
  cap: number;
  mode: "foot" | "ship" | "horse";
  mission: HudMission | null;
  prompt: string | null;
  subtitle: { role: string; text: string } | null;
  notices: string[];
  island: string | null;
  biome: string | null;
  heading: number;
  speed: number;
  shipHp: number;
  shipMax: number;
  throttle: number;
  clock: string;
  hit: number;
  underwater: boolean;
  zoom: boolean;
  players: { name: string; island: string }[];
  room: string;
  connected: boolean;
  captured: number[];
  playerPos: { x: number; z: number; yaw: number };
  shipPos: { x: number; z: number; yaw: number };
  stance: "follow" | "attack";
  locked: boolean;
  chat: { name: string; text: string }[];
  night: boolean;
  cold: boolean;
  fps: number;
  remote: { x: number; z: number; name: string }[];
  roomOwners: Record<number, string>;
}
