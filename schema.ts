import { doublePrecision, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

export const mpPlayers = pgTable("mp_players", {
  id: text("id").primaryKey(),
  room: text("room").notNull(),
  name: text("name").notNull(),
  x: doublePrecision("x").notNull().default(0),
  y: doublePrecision("y").notNull().default(0),
  z: doublePrecision("z").notNull().default(0),
  yaw: doublePrecision("yaw").notNull().default(0),
  mode: text("mode").notNull().default("ship"),
  sx: doublePrecision("sx").notNull().default(0),
  sz: doublePrecision("sz").notNull().default(0),
  syaw: doublePrecision("syaw").notNull().default(0),
  island: integer("island").notNull().default(-1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mpIslands = pgTable(
  "mp_islands",
  {
    room: text("room").notNull(),
    island: integer("island").notNull(),
    owner: text("owner").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.room, t.island] })]
);

export const mpChat = pgTable("mp_chat", {
  id: serial("id").primaryKey(),
  room: text("room").notNull(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
