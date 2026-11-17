import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

let ready: Promise<void> | null = null;
function ensureTables() {
  if (!ready) {
    ready = (async () => {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS mp_players (
        id text PRIMARY KEY, room text NOT NULL, name text NOT NULL,
        x double precision NOT NULL DEFAULT 0, y double precision NOT NULL DEFAULT 0, z double precision NOT NULL DEFAULT 0,
        yaw double precision NOT NULL DEFAULT 0, mode text NOT NULL DEFAULT 'ship',
        sx double precision NOT NULL DEFAULT 0, sz double precision NOT NULL DEFAULT 0, syaw double precision NOT NULL DEFAULT 0,
        island integer NOT NULL DEFAULT -1, updated_at timestamptz NOT NULL DEFAULT now())`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS mp_islands (
        room text NOT NULL, island integer NOT NULL, owner text NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (room, island))`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS mp_chat (
        id serial PRIMARY KEY, room text NOT NULL, name text NOT NULL, text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N}_\-\s'.!?,]/gu, "").slice(0, max) : "");

type Row = Record<string, unknown>;

export async function POST(req: Request) {
  try {
    await ensureTables();
    const b = (await req.json()) as Record<string, unknown>;
    const room = clean(b.room, 24).replace(/\s/g, "").toLowerCase();
    const id = clean(b.id, 24).replace(/\s/g, "");
    const name = clean(b.name, 20) || "Kapitan";
    if (!room || !id) return Response.json({ error: "bad request" }, { status: 400 });
    const mode = b.mode === "foot" || b.mode === "horse" ? b.mode : "ship";
    await db.execute(sql`INSERT INTO mp_players (id, room, name, x, y, z, yaw, mode, sx, sz, syaw, island, updated_at)
      VALUES (${id}, ${room}, ${name}, ${num(b.x)}, ${num(b.y)}, ${num(b.z)}, ${num(b.yaw)}, ${mode}, ${num(b.sx)}, ${num(b.sz)}, ${num(b.syaw)}, ${Math.round(num(b.island, -1))}, now())
      ON CONFLICT (id) DO UPDATE SET room = EXCLUDED.room, name = EXCLUDED.name, x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, yaw = EXCLUDED.yaw,
        mode = EXCLUDED.mode, sx = EXCLUDED.sx, sz = EXCLUDED.sz, syaw = EXCLUDED.syaw, island = EXCLUDED.island, updated_at = now()`);
    if (typeof b.captured === "number" && b.captured >= 0 && b.captured < 16) {
      await db.execute(sql`INSERT INTO mp_islands (room, island, owner) VALUES (${room}, ${Math.round(b.captured)}, ${name}) ON CONFLICT DO NOTHING`);
    }
    const chat = clean(b.chat, 140);
    if (chat) await db.execute(sql`INSERT INTO mp_chat (room, name, text) VALUES (${room}, ${name}, ${chat})`);
    await db.execute(sql`DELETE FROM mp_players WHERE updated_at < now() - interval '30 seconds'`);

    const players = await db.execute(sql`SELECT id, name, x, y, z, yaw, mode, sx, sz, syaw, island FROM mp_players
      WHERE room = ${room} AND id <> ${id} AND updated_at > now() - interval '8 seconds' LIMIT 24`);
    const owners = await db.execute(sql`SELECT island, owner FROM mp_islands WHERE room = ${room}`);
    const since = Math.round(num(b.since, 0));
    const chats =
      since > 0
        ? await db.execute(sql`SELECT id, name, text FROM mp_chat WHERE room = ${room} AND id > ${since} ORDER BY id ASC LIMIT 30`)
        : await db.execute(sql`SELECT id, name, text FROM (SELECT id, name, text FROM mp_chat WHERE room = ${room} ORDER BY id DESC LIMIT 8) t ORDER BY id ASC`);
    return Response.json({
      players: (players.rows as Row[]).map((r) => ({ ...r, x: Number(r.x), y: Number(r.y), z: Number(r.z), yaw: Number(r.yaw), sx: Number(r.sx), sz: Number(r.sz), syaw: Number(r.syaw), island: Number(r.island) })),
      owners: (owners.rows as Row[]).map((r) => ({ island: Number(r.island), owner: String(r.owner) })),
      chat: (chats.rows as Row[]).map((r) => ({ id: Number(r.id), name: String(r.name), text: String(r.text) })),
    });
  } catch {
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
