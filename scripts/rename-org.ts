/** One-off: sets the organisation name on the live record. Safe to re-run. */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { getDb, schema } from "../src/db/index";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const req = createRequire(import.meta.url);
const Mod = req("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Mod._load;
Mod._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : load.call(this, request, ...rest);
};

const NAME = process.argv[2];

async function main() {
  if (!NAME) { console.error('Usage: npm run db:org -- "Organisation name"'); process.exit(1); }
  const { audited } = await import("../src/db/audited");
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).limit(1);
  if (!org) { console.error("No organisation row exists yet. Run the seed first."); process.exit(1); }
  await audited(db, { userId: null }).update(schema.organizations, org.id, { name: NAME });
  console.log(`Organisation renamed: "${org.name}" → "${NAME}"`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
