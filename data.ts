// Static game data: biomes, islands, missions, weapons, upgrades

export const ISLAND_BASE_W = 280;
export const ISLAND_BASE_H = 480;
export const ISLAND_SCALE = 3; // islands are 3x bigger than the 280x480 base
export const ISLAND_W = ISLAND_BASE_W * ISLAND_SCALE; // 840 m
export const ISLAND_H = ISLAND_BASE_H * ISLAND_SCALE; // 1440 m
export const ISLAND_A = ISLAND_W / 2; // ellipse half axis x
export const ISLAND_B = ISLAND_H / 2; // ellipse half axis z

export type VegKind =
  | "palm" | "pine" | "snowpine" | "oak" | "acacia" | "cactus" | "bush" | "rock"
  | "deadtree" | "reed" | "crystal" | "sakura" | "mushroom" | "lavarock" | "birch" | "log";

export interface VegSpec {
  kind: VegKind;
  n: number;
  minH: number;
  maxH: number;
  s: [number, number];
  cluster: number; // 0 = uniform, higher = patchier forests
  tint: [number, number];
}

export type Weather = "none" | "snow" | "ash" | "rain" | "petals" | "sand" | "leaves" | "spores";
export type AnimalKind = "deer" | "zebra" | "goat" | "wolf";
export type Shape = "normal" | "volcano" | "atoll" | "canyon" | "dunes" | "swamp" | "alpine";

export interface BiomeDef {
  key: string;
  name: string;
  sand: number;
  grassA: number;
  grassB: number;
  rock: number;
  high: number;
  relief: number;
  shape: Shape;
  snowLine: number;
  grassDensity: number;
  grassH: number;
  weather: Weather;
  weatherAmt: number;
  cold: boolean;
  veg: VegSpec[];
  animals: AnimalKind[];
}

const v = (kind: VegKind, n: number, minH: number, maxH: number, s: [number, number], cluster: number, tint: [number, number] = [0xffffff, 0xffffff]): VegSpec => ({ kind, n, minH, maxH, s, cluster, tint });

export const BIOMES: BiomeDef[] = [
  { key: "tropical", name: "Tropik sohil", sand: 0xe8d9a8, grassA: 0x3f8a2c, grassB: 0x6aa83a, rock: 0x7c7a70, high: 0x4b6b34, relief: 55, shape: "normal", snowLine: 999, grassDensity: 0.8, grassH: 0.7, weather: "none", weatherAmt: 0, cold: false, animals: ["deer"],
    veg: [v("palm", 1500, 1.2, 40, [0.9, 1.5], 0.3, [0xdfffd0, 0xffffff]), v("bush", 900, 1.5, 50, [0.8, 1.6], 0.4, [0xc8ffb0, 0xffffff]), v("rock", 160, 0.5, 80, [0.8, 2.4], 0)] },
  { key: "desert", name: "Qizil sahro", sand: 0xe2b877, grassA: 0xc9a266, grassB: 0xd8b57a, rock: 0x9a6b45, high: 0xb48252, relief: 40, shape: "dunes", snowLine: 999, grassDensity: 0.25, grassH: 0.45, weather: "sand", weatherAmt: 0.5, cold: false, animals: ["goat"],
    veg: [v("cactus", 520, 1.5, 60, [0.8, 1.7], 0.5), v("deadtree", 160, 1.5, 60, [0.8, 1.4], 0.5), v("rock", 420, 0.5, 80, [0.8, 3.2], 0.2, [0xffd9a8, 0xffffff]), v("bush", 260, 1.5, 60, [0.5, 1], 0.6, [0xd8c080, 0xffffff])] },
  { key: "arctic", name: "Muz o'lkasi", sand: 0xdfe8ee, grassA: 0xf0f6fa, grassB: 0xdbe7ef, rock: 0x8d9aa5, high: 0xffffff, relief: 70, shape: "normal", snowLine: 6, grassDensity: 0.15, grassH: 0.3, weather: "snow", weatherAmt: 1, cold: true, animals: ["wolf"],
    veg: [v("snowpine", 1400, 2, 80, [0.9, 1.8], 0.45), v("rock", 360, 0.5, 90, [0.8, 3], 0.1, [0xdde8f0, 0xffffff]), v("deadtree", 120, 2, 50, [0.7, 1.2], 0.5, [0xb0b8c0, 0xffffff])] },
  { key: "jungle", name: "Yashil o'rmon", sand: 0xcdbf8a, grassA: 0x1f6a1a, grassB: 0x2f8a22, rock: 0x5a5a50, high: 0x2c5a24, relief: 70, shape: "normal", snowLine: 999, grassDensity: 1, grassH: 0.9, weather: "rain", weatherAmt: 0.35, cold: false, animals: ["deer"],
    veg: [v("oak", 1800, 1.5, 70, [1.2, 2.3], 0.35, [0xa8e090, 0xe0ffd0]), v("palm", 700, 1.2, 40, [1, 1.6], 0.4), v("bush", 1400, 1.5, 70, [1, 2], 0.3, [0x90d070, 0xffffff]), v("mushroom", 100, 1.5, 60, [0.5, 1], 0.7)] },
  { key: "volcano", name: "Olov tog'i", sand: 0x3a3532, grassA: 0x3a3028, grassB: 0x4a3a30, rock: 0x2b2624, high: 0x1c1816, relief: 80, shape: "volcano", snowLine: 999, grassDensity: 0.1, grassH: 0.3, weather: "ash", weatherAmt: 1, cold: false, animals: ["goat"],
    veg: [v("lavarock", 220, 0.5, 400, [0.8, 2.6], 0.2), v("rock", 450, 0.5, 400, [0.8, 3], 0.1, [0x777777, 0xaaaaaa]), v("deadtree", 140, 1.5, 120, [0.8, 1.5], 0.5, [0x555555, 0x888888])] },
  { key: "savanna", name: "Oltin dasht", sand: 0xe3cf98, grassA: 0xb5a747, grassB: 0xd2bd5a, rock: 0x8c7d62, high: 0x9a8a50, relief: 25, shape: "normal", snowLine: 999, grassDensity: 1, grassH: 1.0, weather: "none", weatherAmt: 0, cold: false, animals: ["zebra", "deer"],
    veg: [v("acacia", 320, 1.5, 40, [1, 1.9], 0.4), v("bush", 700, 1.5, 40, [0.7, 1.4], 0.5, [0xd0c070, 0xffffff]), v("rock", 140, 0.5, 40, [0.8, 2.5], 0.1)] },
  { key: "swamp", name: "Qora botqoq", sand: 0x6e6a43, grassA: 0x44552a, grassB: 0x59702f, rock: 0x4a4b3e, high: 0x38452a, relief: 8, shape: "swamp", snowLine: 999, grassDensity: 1, grassH: 0.8, weather: "rain", weatherAmt: 0.7, cold: false, animals: ["deer"],
    veg: [v("deadtree", 650, 0.2, 10, [1, 2], 0.4, [0x6a6a58, 0x9a9a80]), v("reed", 2600, 0.1, 4, [0.8, 1.7], 0.4), v("mushroom", 260, 0.3, 8, [0.6, 1.4], 0.6), v("oak", 260, 0.5, 8, [1, 1.7], 0.5, [0x6a8a40, 0x9a9a50])] },
  { key: "autumn", name: "Kuz o'rmoni", sand: 0xcab98a, grassA: 0x8a7a2a, grassB: 0xb06a22, rock: 0x6e665c, high: 0x7a5a2a, relief: 60, shape: "normal", snowLine: 999, grassDensity: 0.9, grassH: 0.6, weather: "leaves", weatherAmt: 0.8, cold: false, animals: ["deer"],
    veg: [v("birch", 1200, 1.5, 60, [1, 1.9], 0.4, [0xffc060, 0xff6a30]), v("oak", 1300, 1.5, 60, [1.1, 2], 0.4, [0xff9a40, 0xd04a20]), v("bush", 700, 1.5, 60, [0.8, 1.5], 0.4, [0xd09030, 0xb04a20]), v("log", 100, 1.5, 60, [0.8, 1.4], 0), v("rock", 160, 0.5, 60, [0.8, 2.2], 0)] },
  { key: "canyon", name: "Qizil kanyon", sand: 0xd0966a, grassA: 0xb8734a, grassB: 0xc98558, rock: 0x9c5a3a, high: 0xc07a48, relief: 90, shape: "canyon", snowLine: 999, grassDensity: 0.15, grassH: 0.35, weather: "sand", weatherAmt: 0.3, cold: false, animals: ["goat"],
    veg: [v("rock", 900, 0.5, 200, [1, 4], 0.1, [0xf0b090, 0xffffff]), v("cactus", 220, 1.5, 60, [0.8, 1.5], 0.5), v("deadtree", 100, 1.5, 60, [0.8, 1.3], 0.5), v("bush", 200, 1.5, 60, [0.5, 1], 0.5, [0xb09050, 0xffffff])] },
  { key: "mangrove", name: "Mangrov yo'li", sand: 0xb5ab7c, grassA: 0x2d6a3a, grassB: 0x3c8a4a, rock: 0x555a4c, high: 0x2a5a36, relief: 10, shape: "swamp", snowLine: 999, grassDensity: 0.9, grassH: 0.7, weather: "none", weatherAmt: 0, cold: false, animals: ["deer"],
    veg: [v("palm", 700, 0.3, 12, [0.8, 1.3], 0.3), v("reed", 2200, 0.1, 5, [0.9, 1.8], 0.3), v("bush", 1100, 0.4, 12, [0.8, 1.6], 0.3, [0x70b070, 0xffffff]), v("oak", 450, 0.4, 12, [1.1, 1.9], 0.4, [0x60a060, 0x90d080])] },
  { key: "atoll", name: "Marjon atoll", sand: 0xf4ecc8, grassA: 0x5aa83a, grassB: 0x7ac44a, rock: 0x9a9c92, high: 0x7ac44a, relief: 12, shape: "atoll", snowLine: 999, grassDensity: 0.7, grassH: 0.5, weather: "none", weatherAmt: 0, cold: false, animals: [],
    veg: [v("palm", 1100, 0.9, 12, [0.9, 1.5], 0.2, [0xe0ffd0, 0xffffff]), v("bush", 500, 1, 12, [0.6, 1.2], 0.3), v("rock", 140, 0.5, 12, [0.6, 1.6], 0.2, [0xffffff, 0xf0f0f0])] },
  { key: "tundra", name: "Taiga tundrasi", sand: 0xa9a58a, grassA: 0x6b7a4a, grassB: 0x8a9460, rock: 0x7a7a74, high: 0xaab0a0, relief: 45, shape: "normal", snowLine: 60, grassDensity: 0.7, grassH: 0.4, weather: "snow", weatherAmt: 0.45, cold: true, animals: ["wolf", "deer"],
    veg: [v("pine", 1300, 1.5, 70, [0.9, 1.7], 0.5, [0xbcd0c0, 0xffffff]), v("snowpine", 400, 20, 90, [0.9, 1.6], 0.5), v("rock", 360, 0.5, 90, [0.8, 2.6], 0.1), v("bush", 500, 1.5, 70, [0.5, 1], 0.4, [0x8a9a5a, 0xaaaa70])] },
  { key: "sakura", name: "Sakura vodiysi", sand: 0xeadcc0, grassA: 0x62a640, grassB: 0x8bc454, rock: 0x8a8678, high: 0x5a9a40, relief: 50, shape: "normal", snowLine: 999, grassDensity: 1, grassH: 0.6, weather: "petals", weatherAmt: 1, cold: false, animals: ["deer"],
    veg: [v("sakura", 1500, 1.5, 55, [1.1, 2], 0.35, [0xffd8e8, 0xffa8c8]), v("pine", 350, 1.5, 55, [0.8, 1.3], 0.4), v("bush", 800, 1.5, 55, [0.7, 1.4], 0.4, [0xffc0d8, 0xffffff]), v("rock", 140, 0.5, 55, [0.8, 2.2], 0.2)] },
  { key: "ash", name: "Kul cho'li", sand: 0x6a645e, grassA: 0x55504a, grassB: 0x6a645a, rock: 0x3c3a38, high: 0x4a4642, relief: 55, shape: "normal", snowLine: 999, grassDensity: 0.25, grassH: 0.35, weather: "ash", weatherAmt: 0.7, cold: false, animals: ["wolf"],
    veg: [v("deadtree", 1000, 1.5, 80, [1, 2.2], 0.4, [0x4a4642, 0x7a746a]), v("rock", 600, 0.5, 80, [1, 3.5], 0.2, [0x777777, 0xaaaaaa]), v("lavarock", 90, 0.5, 80, [0.8, 2], 0.3)] },
  { key: "crystal", name: "Billur orol", sand: 0xb8b0d8, grassA: 0x5a4aa0, grassB: 0x3a8aa8, rock: 0x4a4468, high: 0x7a64c0, relief: 65, shape: "normal", snowLine: 999, grassDensity: 0.6, grassH: 0.5, weather: "spores", weatherAmt: 1, cold: false, animals: ["deer"],
    veg: [v("crystal", 700, 1.5, 90, [1, 3.2], 0.4, [0xa080ff, 0x60e0ff]), v("mushroom", 400, 1.5, 70, [1, 2.2], 0.5), v("bush", 500, 1.5, 70, [0.8, 1.5], 0.4, [0x8070d0, 0x60b0d0]), v("rock", 200, 0.5, 90, [0.8, 2.4], 0.1, [0x8a80b0, 0xb0a0e0])] },
  { key: "alpine", name: "Ahd cho'qqisi", sand: 0xbdb7a2, grassA: 0x4f7a3a, grassB: 0x6d9448, rock: 0x74706a, high: 0xf4f8ff, relief: 190, shape: "alpine", snowLine: 95, grassDensity: 0.8, grassH: 0.45, weather: "snow", weatherAmt: 0.55, cold: true, animals: ["goat", "wolf"],
    veg: [v("pine", 1400, 1.5, 85, [1, 2], 0.45), v("snowpine", 500, 70, 160, [1, 1.8], 0.5), v("rock", 800, 0.5, 220, [1, 4], 0.1), v("bush", 400, 1.5, 70, [0.6, 1.2], 0.4)] },
];

export type MissionKind = "collect" | "kill" | "activate" | "destroy" | "hunt" | "survive" | "checkpoints" | "boss" | "ships" | "rescue";

export interface MissionDef {
  kind: MissionKind;
  title: string;
  desc: string;
  noun: string;
  target: number;
  time?: number;
  reward: number;
}

export interface IslandDef {
  id: number;
  biome: number;
  name: string;
  cx: number;
  cz: number;
  seed: number;
  mission: MissionDef;
}

const M = (kind: MissionKind, title: string, desc: string, noun: string, target: number, reward: number, time?: number): MissionDef => ({ kind, title, desc, noun, target, reward, time });

const ISLAND_META: { biome: number; name: string; mission: MissionDef }[] = [
  { biome: 0, name: "Palma ko'rfazi", mission: M("collect", "Dengiz xazinasi", "Qirg'oq bo'ylab yashiringan xazina sandiqlarini top.", "sandiq", 6, 400) },
  { biome: 1, name: "Qum Bo'roni", mission: M("kill", "Qaroqchilar lageri", "Sahrodagi qaroqchilarni yo'q qil.", "qaroqchi", 12, 700) },
  { biome: 2, name: "Muz Qal'asi", mission: M("activate", "Signal olovlari", "Uchta maniyak chiroqni yoqib, kemalarga yo'l ko'rsat.", "chiroq", 3, 900) },
  { biome: 3, name: "Yashil Do'zax", mission: M("rescue", "Asirlarni qutqar", "Tuzoqdagi mahbuslarni ozod qil — ular qo'shiningga qo'shiladi.", "asir", 4, 1100) },
  { biome: 4, name: "Olov Tog'i", mission: M("destroy", "To'p minoralari", "Vulqon yonbag'ridagi dushman to'p minoralarini vayron qil.", "minora", 5, 1500) },
  { biome: 5, name: "Oltin Dasht", mission: M("hunt", "Katta ov", "Ovqat uchun yovvoyi hayvonlarni ovla.", "hayvon", 8, 1300) },
  { biome: 6, name: "Qora Botqoq", mission: M("survive", "Qurbongohni himoya qil", "Botqoq qurbongohi yonida mudofaa tur, to'lqinlarga bardosh ber.", "soniya", 110, 1800, 110) },
  { biome: 7, name: "Kuz O'rmoni", mission: M("checkpoints", "Yo'qolgan xarita", "Vaqt tugamasdan to'rtta belgiga ketma-ket yet.", "belgi", 4, 1700, 260) },
  { biome: 8, name: "Qizil Kanyon", mission: M("boss", "Qaroqchilar shohi", "Kanyon ichidagi qaroqchilar shohini mag'lub et.", "shoh", 1, 2600) },
  { biome: 9, name: "Mangrov Yo'li", mission: M("ships", "Qaroqchi kemalari", "Orol atrofini qo'riqlayotgan 3 ta kemani cho'ktir.", "kema", 3, 2400) },
  { biome: 10, name: "Marjon Atolli", mission: M("collect", "Injular", "Atoll halqasidan 10 ta dur toping.", "dur", 10, 2000) },
  { biome: 11, name: "Taiga Qiyoqasi", mission: M("kill", "Bo'ri galasi", "Taiga bo'rilarini va qaroqchilarini tinchit.", "dushman", 14, 2600) },
  { biome: 12, name: "Sakura Vodiysi", mission: M("activate", "Besh ziyoratgoh", "Beshta qadimgi ziyoratgohni yoq.", "ziyoratgoh", 5, 2800) },
  { biome: 13, name: "Kul Cho'li", mission: M("destroy", "Qora totemlar", "Kul cho'lidagi 6 ta la'nat totemini sindir.", "totem", 6, 3300) },
  { biome: 14, name: "Billur Orol", mission: M("collect", "Aether billurlari", "8 ta Aether billurini yig'. Qo'riqchilardan ehtiyot bo'l!", "billur", 8, 3600) },
  { biome: 15, name: "Ahd Cho'qqisi", mission: M("boss", "Admiral bilan jang", "Cho'qqi tepasida admiralni mag'lub etib gorizontni egalla.", "admiral", 1, 6000) },
];

function buildIslands(): IslandDef[] {
  const out: IslandDef[] = [];
  const colX = [-3450, -1150, 1150, 3450];
  const rowZ = [4350, 1450, -1450, -4350];
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(i / 4);
    let c = i % 4;
    if (r % 2 === 1) c = 3 - c;
    const jx = ((i * 97) % 11) * 22 - 110;
    const jz = ((i * 53) % 9) * 24 - 96;
    const meta = ISLAND_META[i];
    out.push({ id: i, biome: meta.biome, name: meta.name, cx: colX[c] + jx, cz: rowZ[r] + jz, seed: 1000 + i * 7919, mission: meta.mission });
  }
  return out;
}
export const ISLANDS: IslandDef[] = buildIslands();

export interface WeaponDef {
  id: number;
  name: string;
  dmg: number;
  rate: number;
  mag: number;
  reload: number;
  spread: number;
  pellets: number;
  range: number;
  auto: boolean;
  price: number;
  zoom: number;
  splash: number;
  sound: "pistol" | "shotgun" | "rifle" | "smg" | "sniper" | "cannon";
}

export const WEAPONS: WeaponDef[] = [
  { id: 0, name: "Tapancha", dmg: 28, rate: 2.6, mag: 8, reload: 1.4, spread: 0.012, pellets: 1, range: 120, auto: false, price: 0, zoom: 1.15, splash: 0, sound: "pistol" },
  { id: 1, name: "Zambarak miltiq", dmg: 58, rate: 1.2, mag: 6, reload: 2.0, spread: 0.006, pellets: 1, range: 260, auto: false, price: 600, zoom: 1.4, splash: 0, sound: "rifle" },
  { id: 2, name: "Ov miltig'i", dmg: 15, rate: 1.1, mag: 6, reload: 2.5, spread: 0.07, pellets: 9, range: 55, auto: false, price: 900, zoom: 1.1, splash: 0, sound: "shotgun" },
  { id: 3, name: "Avtomat", dmg: 17, rate: 11, mag: 32, reload: 1.9, spread: 0.028, pellets: 1, range: 170, auto: true, price: 1500, zoom: 1.2, splash: 0, sound: "smg" },
  { id: 4, name: "Snayper", dmg: 170, rate: 0.8, mag: 5, reload: 2.7, spread: 0.0008, pellets: 1, range: 600, auto: false, price: 2600, zoom: 3.6, splash: 0, sound: "sniper" },
  { id: 5, name: "Granata otar", dmg: 130, rate: 0.7, mag: 4, reload: 3.0, spread: 0.01, pellets: 1, range: 220, auto: false, price: 4200, zoom: 1.2, splash: 9, sound: "cannon" },
];

export const MAX_LVL = 5;
export const upgradeCost = (base: number, lvl: number) => Math.round(base * (1 + lvl * 0.9));

export interface Save {
  name: string;
  gold: number;
  owned: boolean[];
  wlvl: { dmg: number; mag: number; rate: number }[];
  hpLvl: number;
  armorLvl: number;
  speedLvl: number;
  hullLvl: number;
  sailLvl: number;
  cannonLvl: number;
  capLvl: number;
  sdmgLvl: number;
  soldiers: number;
  captured: number[];
  kills: number;
}

export function defaultSave(): Save {
  return {
    name: "Kapitan",
    gold: 350,
    owned: WEAPONS.map((_, i) => i === 0),
    wlvl: WEAPONS.map(() => ({ dmg: 0, mag: 0, rate: 0 })),
    hpLvl: 0, armorLvl: 0, speedLvl: 0, hullLvl: 0, sailLvl: 0, cannonLvl: 0, capLvl: 0, sdmgLvl: 0,
    soldiers: 2,
    captured: [],
    kills: 0,
  };
}

export const soldierCap = (s: Save) => 4 + s.capLvl * 3;
export const soldierPrice = (s: Save) => 120 + s.soldiers * 25;
