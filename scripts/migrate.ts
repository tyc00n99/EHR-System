/** Applies pending migrations to DATABASE_URL (or the local PGlite store). Runs before every build. */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
import { migrateDb } from "../src/db/index";

migrateDb()
  .then((kind) => { console.log(`Migrations applied (${kind}).`); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
