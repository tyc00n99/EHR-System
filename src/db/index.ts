import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), "data", "pglite");
const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __ehrDb?: Promise<Db> };

async function open(): Promise<Db> {
  mkdirSync(DATA_DIR, { recursive: true });
  const client = new PGlite(DATA_DIR);
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

/** Singleton PGlite connection. Survives Next.js dev hot reloads via globalThis. */
export function getDb(): Promise<Db> {
  if (!g.__ehrDb) g.__ehrDb = open();
  return g.__ehrDb;
}

export { schema };
