/** Wipes the configured database. Local PGlite: deletes the folder. Hosted Postgres: drops and recreates the public schema. Refuses unless CONFIRM_RESET=yes when DATABASE_URL is set. */
import { existsSync, readFileSync, rmSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    rmSync(process.env.PGLITE_DATA_DIR ?? "data/pglite", { recursive: true, force: true });
    console.log("Local PGlite store removed.");
    return;
  }
  if (process.env.CONFIRM_RESET !== "yes") {
    console.error("DATABASE_URL is set. This would erase the hosted database. Re-run with CONFIRM_RESET=yes if that is what you want.");
    process.exit(1);
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false });
  await sql.unsafe("drop schema public cascade; create schema public;");
  await sql.unsafe("drop schema if exists drizzle cascade;");
  await sql.end();
  console.log("Hosted database wiped.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
