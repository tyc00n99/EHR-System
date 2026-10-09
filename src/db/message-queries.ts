import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema } from "./index";

const { messages, users, staff } = schema;

/** A user someone can message, with the name the roster knows them by. */
export interface MessageContact {
  userId: string;
  name: string;
  initials: string;
  role: "admin" | "supervisor" | "dsp";
  title: string | null;
}

function contactRow(u: { id: string; role: "admin" | "supervisor" | "dsp" }, s: { firstName: string; lastName: string; title: string | null } | null, email: string): MessageContact {
  const name = s ? `${s.firstName} ${s.lastName}`.trim() : email;
  const initials = s ? `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase() : email.slice(0, 2).toUpperCase();
  return { userId: u.id, name, initials, role: u.role, title: s?.title ?? null };
}

/**
 * Who this person may start a conversation with. A caregiver messages management (admins and
 * supervisors); office roles message anyone with an active login. Nobody messages themselves.
 */
export async function listMessageContacts(me: { userId: string; role: "admin" | "supervisor" | "dsp" }): Promise<MessageContact[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, role: users.role, email: users.email, firstName: staff.firstName, lastName: staff.lastName, title: staff.title })
    .from(users)
    .leftJoin(staff, eq(users.staffId, staff.id))
    .where(and(
      eq(users.active, true),
      ne(users.id, me.userId),
      ...(me.role === "dsp" ? [inArray(users.role, ["admin", "supervisor"] as const)] : []),
    ));
  return rows
    .map((r) => contactRow({ id: r.id, role: r.role }, r.firstName ? { firstName: r.firstName, lastName: r.lastName ?? "", title: r.title } : null, r.email))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface Conversation {
  contact: MessageContact;
  lastBody: string;
  lastAt: Date;
  lastFromMe: boolean;
  unread: number;
}

/** The inbox: one row per counterpart, newest first, with the unread count from them. */
export async function listConversations(me: { userId: string; role: "admin" | "supervisor" | "dsp" }): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      recipientId: messages.recipientId,
      body: messages.body,
      createdAt: messages.createdAt,
      readAt: messages.readAt,
    })
    .from(messages)
    .where(or(eq(messages.senderId, me.userId), eq(messages.recipientId, me.userId)))
    .orderBy(desc(messages.createdAt))
    .limit(2000);
  const byOther = new Map<string, { lastBody: string; lastAt: Date; lastFromMe: boolean; unread: number }>();
  for (const m of rows) {
    const fromMe = m.senderId === me.userId;
    const other = fromMe ? m.recipientId : m.senderId;
    const entry = byOther.get(other);
    if (!entry) byOther.set(other, { lastBody: m.body, lastAt: m.createdAt, lastFromMe: fromMe, unread: !fromMe && !m.readAt ? 1 : 0 });
    else if (!fromMe && !m.readAt) entry.unread += 1;
  }
  if (byOther.size === 0) return [];
  const contacts = await db
    .select({ id: users.id, role: users.role, email: users.email, firstName: staff.firstName, lastName: staff.lastName, title: staff.title })
    .from(users)
    .leftJoin(staff, eq(users.staffId, staff.id))
    .where(inArray(users.id, [...byOther.keys()]));
  const named = new Map(contacts.map((r) => [r.id, contactRow({ id: r.id, role: r.role }, r.firstName ? { firstName: r.firstName, lastName: r.lastName ?? "", title: r.title } : null, r.email)]));
  return [...byOther.entries()]
    .map(([id, c]) => ({ contact: named.get(id) ?? { userId: id, name: "Former login", initials: "–", role: "dsp" as const, title: null }, ...c }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

/** The whole thread with one person, oldest first. */
export async function listThread(meId: string, otherId: string, limit = 500) {
  const db = await getDb();
  return db
    .select()
    .from(messages)
    .where(or(
      and(eq(messages.senderId, meId), eq(messages.recipientId, otherId)),
      and(eq(messages.senderId, otherId), eq(messages.recipientId, meId)),
    ))
    .orderBy(asc(messages.createdAt))
    .limit(limit);
}

/** Unread messages addressed to this person, for the inbox badge on the page itself. */
export async function countUnread(meId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.recipientId, meId), isNull(messages.readAt)));
  return row?.n ?? 0;
}
