/**
 * Issues a signing code to any active client that has none.
 *
 * New clients get one from `createPerson`, but rows seeded before that existed (and any created by
 * a direct insert) can still be missing one. Additive and safe to re-run: clients that already have
 * a code are left alone.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../src/db/index";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// `queries.ts` and `client-code.ts` both import "server-only", which throws outside Next. Stub it
// so this script can reuse the same audited code path the app uses.
const req = createRequire(import.meta.url);
const Mod = req("node:module") as { _load: (request: string, ...rest: unknown[]) => unknown };
const load = Mod._load;
Mod._load = function (this: unknown, request: string, ...rest: unknown[]) {
  return request === "server-only" ? {} : load.call(this, request, ...rest);
};

async function main() {
  const { getOrganization } = await import("../src/db/queries");
  const { issueClientCode } = await import("../src/lib/client-code");
  const db = await getDb();
  const org = await getOrganization();
  const missing = await db
    .select({ id: schema.people.id, firstName: schema.people.firstName, lastName: schema.people.lastName, phone: schema.people.phone, smsConsent: schema.people.smsConsent })
    .from(schema.people)
    .where(and(eq(schema.people.status, "active"), isNull(schema.people.signatureCodeHash)));

  if (missing.length === 0) {
    console.log("Every active client already has a signing code.");
    return;
  }
  for (const p of missing) {
    const issued = await issueClientCode(db, null, p, org.name);
    console.log(`${p.firstName} ${p.lastName}: code issued${issued.texted ? " and texted" : ` (${issued.reason ?? "not texted"})`}`);
  }
  console.log(`\nDone. ${missing.length} client${missing.length === 1 ? "" : "s"} updated.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
