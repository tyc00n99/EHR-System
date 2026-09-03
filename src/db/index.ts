import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";
import * as schema from "./schema";

/**
 * Database handle. Two drivers, one code path:
 * - DATABASE_URL set (Neon, Supabase, RDS, any Postgres): postgres-js.
 * - Otherwise: embedded PGlite in ./data/pglite for local development.
 * Migrations run at startup for PGlite only. Hosted Postgres migrates at build time (`npm run db:migrate`).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Read lazily: scripts load .env.local after imports are evaluated. */
export const databaseUrl = () => process.env.DATABASE_URL?.trim() || null;
export const PGLITE_DIR = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), "data", "pglite");
export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

const g = globalThis as unknown as { __ehrDb?: Promise<Db> };

async function openPostgres(url: string): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  // Serverless-friendly: few connections, no prepared statements (works through Neon's pooler).
  const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return drizzle(client, { schema }) as unknown as Db;
}

async function openPglite(): Promise<Db> {
  const { mkdirSync } = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  mkdirSync(PGLITE_DIR, { recursive: true });
  const client = new PGlite(PGLITE_DIR);
  await client.waitReady;
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as Db;
}

/** Singleton connection. Survives Next.js dev hot reloads via globalThis. */
export function getDb(): Promise<Db> {
  if (!g.__ehrDb) {
    const url = databaseUrl();
    g.__ehrDb = url ? openPostgres(url) : openPglite();
  }
  return g.__ehrDb;
}

/** Apply pending migrations to whichever database is configured. Used by scripts/migrate.ts and the build. */
export async function migrateDb(): Promise<"postgres" | "pglite"> {
  const url = databaseUrl();
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { default: postgres } = await import("postgres");
    const client = postgres(url, { max: 1, prepare: false });
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    } finally {
      await client.end();
    }
    return "postgres";
  }
  await getDb();
  return "pglite";
}

export { schema };
