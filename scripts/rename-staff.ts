/** One-off: renames a staff member by email. Safe to re-run. */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { eq } from "drizzle-orm";
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

const [email, first, last] = process.argv.slice(2);

async function main() {
  if (!email || !first) { console.error('Usage: npm run db:staff-name -- <email> <First> [Last]'); process.exit(1); }
  const { audited } = await import("../src/db/audited");
  const db = await getDb();
  const [row] = await db
    .select({ staffId: schema.users.staffId, first: schema.staff.firstName, last: schema.staff.lastName })
    .from(schema.users)
    .leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id))
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!row?.staffId) { console.error(`No staff record is linked to ${email}.`); process.exit(1); }
  await audited(db, { userId: null }).update(schema.staff, row.staffId, { firstName: first, ...(last ? { lastName: last } : {}) });
  console.log(`Renamed: "${row.first} ${row.last}" → "${first} ${last ?? row.last}"`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
