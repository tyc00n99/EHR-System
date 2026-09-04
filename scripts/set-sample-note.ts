/** Dev aid: replace the narrative on Jordan Abelard's most recent H2014 note with a long sample so the PDF can be checked. */
import { existsSync, readFileSync } from "node:fs";
if (existsSync(".env.local")) for (const line of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/index";
import { audited } from "../src/db/audited";

async function main() {
  const text = readFileSync(process.argv[2], "utf8").trim();
  const db = await getDb();
  const [p] = await db.select().from(schema.people).where(eq(schema.people.lastName, "Abelard")).limit(1);
  const [v] = await db.select().from(schema.visits).where(and(eq(schema.visits.personId, p.id), eq(schema.visits.serviceCode, "H2014"))).orderBy(desc(schema.visits.clockInAt)).limit(1);
  await audited(db, { userId: null }).update(schema.visits, v.id, { shiftNote: text });
  console.log("updated", v.id, v.clockInAt.toISOString());
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
