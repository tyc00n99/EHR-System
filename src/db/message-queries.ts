import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { abilitiesFor } from "@/lib/auth";
import { hasAbility } from "@/lib/abilities";
import { audited } from "./audited";
import { getDb, schema } from "./index";

const { messages, users, staff, people, assignments, chatChannels, chatChannelMembers, chatThreads, chatReads, messageMentions, messageAttachments } = schema;

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
    .where(and(isNull(messages.threadId), or(eq(messages.senderId, me.userId), eq(messages.recipientId, me.userId))))
    .orderBy(desc(messages.createdAt))
    .limit(2000);
  const byOther = new Map<string, { lastBody: string; lastAt: Date; lastFromMe: boolean; unread: number }>();
  for (const m of rows) {
    const fromMe = m.senderId === me.userId;
    const other = fromMe ? m.recipientId : m.senderId;
    if (!other) continue;
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

/* ---------------------------------------------------------------------------------------------
 * Channels, threads, mentions and attachments (Oct 16, 2026).
 * ------------------------------------------------------------------------------------------- */

export interface Me {
  userId: string;
  role: "admin" | "supervisor" | "dsp";
  abilities: readonly string[];
  /** The caregiver record behind this login, if any: client channels follow its assignments. */
  staffId: string | null;
}

/** Office staff (anyone who sees every client) may read and post in any open channel. */
export const isOffice = (me: Pick<Me, "abilities">) => hasAbility(me.abilities, "all_clients");
/** Admins, and anyone who may run the review queue, create and manage channels. */
export const canCreateChannels = (me: Pick<Me, "abilities">) => hasAbility(me.abilities, "review");

async function namedUsers(ids: string[]): Promise<Map<string, MessageContact>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, role: users.role, email: users.email, firstName: staff.firstName, lastName: staff.lastName, title: staff.title })
    .from(users)
    .leftJoin(staff, eq(users.staffId, staff.id))
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, contactRow({ id: r.id, role: r.role }, r.firstName ? { firstName: r.firstName, lastName: r.lastName ?? "", title: r.title } : null, r.email)]));
}
const FORMER: MessageContact = { userId: "", name: "Former login", initials: "–", role: "dsp", title: null };

export interface ChannelInfo {
  id: string;
  name: string;
  icon: string;
  tint: string;
  isPrivate: boolean;
  isMember: boolean;
  canManage: boolean;
  createdBy: string | null;
  /** Everyone on the member list (for the settings window). Empty for a client channel, whose members are its assigned staff. */
  memberIds: string[];
  /** Set on a client's own channel. */
  personId: string | null;
}

/**
 * Channels this person can see.
 * - A client's channel: anyone with an active assignment to that client, plus every office login.
 *   Membership is read live from `assignments`, so an unassigned caregiver loses it immediately.
 *   Channels of discharged clients leave the list (their threads are kept).
 * - Any other channel: its members, plus every office login when it is not private.
 */
export async function visibleChannels(me: Me): Promise<ChannelInfo[]> {
  const db = await getDb();
  const [allMembers, rows, mine] = await Promise.all([
    db.select({ channelId: chatChannelMembers.channelId, userId: chatChannelMembers.userId }).from(chatChannelMembers),
    db.select({ c: chatChannels, firstName: people.firstName, lastName: people.lastName, status: people.status })
      .from(chatChannels).leftJoin(people, eq(chatChannels.personId, people.id))
      .where(isNull(chatChannels.archivedAt)),
    me.staffId
      ? db.select({ personId: assignments.personId }).from(assignments).where(and(eq(assignments.staffId, me.staffId), eq(assignments.active, true)))
      : Promise.resolve([] as { personId: string }[]),
  ]);
  const memberOf = new Set(allMembers.filter((m) => m.userId === me.userId).map((m) => m.channelId));
  const assigned = new Set(mine.map((m) => m.personId));
  const office = isOffice(me);
  const manager = canCreateChannels(me);
  const out: ChannelInfo[] = [];
  for (const { c, firstName, lastName, status } of rows) {
    if (c.personId) {
      if (status === "discharged") continue;
      const isMember = assigned.has(c.personId);
      if (!isMember && !office) continue;
      out.push({
        id: c.id, name: `${firstName ?? ""} ${lastName ?? ""}`.trim() || c.name, icon: "person", tint: "neutral", isPrivate: false,
        createdBy: null, isMember, canManage: false, memberIds: [], personId: c.personId,
      });
      continue;
    }
    if (!memberOf.has(c.id) && (c.isPrivate || !office)) continue;
    out.push({
      id: c.id, name: c.name, icon: c.icon, tint: c.tint, isPrivate: c.isPrivate, createdBy: c.createdBy, personId: null,
      isMember: memberOf.has(c.id),
      memberIds: allMembers.filter((m) => m.channelId === c.id).map((m) => m.userId),
      canManage: me.role === "admin" || (manager && (c.createdBy === me.userId || memberOf.has(c.id))),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Make sure every client has their own channel. Cheap when nothing is missing (one read); the
 * migration back-filled existing clients and `createPerson` calls this for new ones, so this only
 * catches rows written some other way (a seed, a script).
 */
export async function ensureClientChannels(actorUserId: string | null): Promise<void> {
  const db = await getDb();
  const missing = await db
    .select({ id: people.id, firstName: people.firstName, lastName: people.lastName })
    .from(people)
    .leftJoin(chatChannels, eq(chatChannels.personId, people.id))
    .where(isNull(chatChannels.id));
  if (missing.length === 0) return;
  const w = audited(db, { userId: actorUserId });
  for (const p of missing) {
    await w.insert(chatChannels, { personId: p.id, name: `${p.firstName} ${p.lastName}`.trim(), icon: "person", tint: "primary", isPrivate: false })
      .catch(() => undefined); // another request created it first (unique on person_id)
  }
}

/**
 * A channel's own conversation (Oct 16, 2026, user: clicking a channel should start a chat). It is
 * the channel's thread with an empty title — no new column, and every thread rule (visibility,
 * posting, mentions, files, unread marks) applies unchanged. Created the first time the channel
 * is opened; the list draws it as the channel itself, never as a thread.
 */
export async function ensureChannelHome(me: Me, channelId: string): Promise<string | null> {
  const channel = await channelFor(me, channelId);
  if (!channel) return null;
  const db = await getDb();
  const [home] = await db.select({ id: chatThreads.id }).from(chatThreads).where(and(eq(chatThreads.channelId, channelId), eq(chatThreads.title, ""))).limit(1);
  if (home) return home.id;
  const row = await audited(db, { userId: me.userId }).insert(chatThreads, { channelId, title: "", startedBy: me.userId });
  return row.id;
}

export const isChannelHome = (title: string) => title === "";

export async function channelFor(me: Me, channelId: string): Promise<ChannelInfo | null> {
  return (await visibleChannels(me)).find((c) => c.id === channelId) ?? null;
}

export interface ThreadSummary {
  id: string;
  channelId: string;
  title: string;
  lastAt: string;
  lastBody: string | null;
  lastSender: string | null;
  lastSenderInitials: string;
  lastFromMe: boolean;
  unread: number;
}

/** Every thread in the channels this person can see, newest activity first, with unread counts. */
export async function listThreadSummaries(me: Me, channelIds: string[]): Promise<ThreadSummary[]> {
  if (channelIds.length === 0) return [];
  const db = await getDb();
  const threads = await db.select().from(chatThreads).where(inArray(chatThreads.channelId, channelIds)).orderBy(desc(chatThreads.lastMessageAt));
  if (threads.length === 0) return [];
  const ids = threads.map((t) => t.id);
  const [last, unread] = await Promise.all([
    db.selectDistinctOn([messages.threadId], { threadId: messages.threadId, senderId: messages.senderId, body: messages.body })
      .from(messages).where(inArray(messages.threadId, ids)).orderBy(messages.threadId, desc(messages.createdAt)),
    db.select({ threadId: messages.threadId, n: sql<number>`count(*)::int` })
      .from(messages)
      .leftJoin(chatReads, and(eq(chatReads.threadId, messages.threadId), eq(chatReads.userId, me.userId)))
      .where(and(inArray(messages.threadId, ids), ne(messages.senderId, me.userId), or(isNull(chatReads.lastReadAt), gt(messages.createdAt, chatReads.lastReadAt))))
      .groupBy(messages.threadId),
  ]);
  const people = await namedUsers(last.map((l) => l.senderId));
  const lastBy = new Map(last.map((l) => [l.threadId, l]));
  const unreadBy = new Map(unread.map((u) => [u.threadId, u.n]));
  return threads.map((t) => {
    const l = lastBy.get(t.id);
    const who = l ? people.get(l.senderId) ?? FORMER : null;
    return {
      id: t.id, channelId: t.channelId, title: t.title, lastAt: t.lastMessageAt.toISOString(),
      lastBody: l?.body ?? null, lastSender: who?.name.split(" ")[0] ?? null, lastSenderInitials: who?.initials ?? "–",
      lastFromMe: l?.senderId === me.userId, unread: unreadBy.get(t.id) ?? 0,
    };
  });
}

/** A thread this person may open, with its channel, or null. */
export async function threadFor(me: Me, threadId: string) {
  const db = await getDb();
  const [t] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId));
  if (!t) return null;
  const channel = await channelFor(me, t.channelId);
  if (!channel) return null;
  const starter = t.startedBy ? (await namedUsers([t.startedBy])).get(t.startedBy) ?? FORMER : FORMER;
  return { id: t.id, title: t.title, createdAt: t.createdAt.toISOString(), startedBy: starter.name, channel };
}

/**
 * Who can read a channel: for a client's channel, the logins of everyone actively assigned to the
 * client; otherwise its members. Plus every office login, unless the channel is private.
 */
export async function channelAudience(channelId: string): Promise<MessageContact[]> {
  const db = await getDb();
  const [c] = await db.select().from(chatChannels).where(eq(chatChannels.id, channelId));
  if (!c) return [];
  const ids = new Set<string>();
  if (c.personId) {
    const rows = await db.select({ userId: users.id }).from(assignments)
      .innerJoin(users, eq(users.staffId, assignments.staffId))
      .where(and(eq(assignments.personId, c.personId), eq(assignments.active, true)));
    for (const r of rows) ids.add(r.userId);
  } else {
    const members = await db.select({ userId: chatChannelMembers.userId }).from(chatChannelMembers).where(eq(chatChannelMembers.channelId, channelId));
    for (const m of members) ids.add(m.userId);
  }
  if (!c.isPrivate) {
    const active = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.active, true));
    for (const u of active) if (hasAbility(await abilitiesFor(u.role), "all_clients")) ids.add(u.id);
  }
  if (ids.size === 0) return [];
  const active = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), inArray(users.id, [...ids])));
  const named = await namedUsers(active.map((a) => a.id));
  return [...named.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function channelMemberIds(channelId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ userId: chatChannelMembers.userId }).from(chatChannelMembers).where(eq(chatChannelMembers.channelId, channelId));
  return rows.map((r) => r.userId);
}

export interface ChatMessage {
  id: string;
  sender: MessageContact;
  body: string;
  at: string;
  mentions: { userId: string; name: string }[];
  attachments: { id: string; fileName: string; contentType: string; sizeBytes: number }[];
}

async function enrich(rows: { id: string; senderId: string; body: string; createdAt: Date }[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.id);
  const [ments, files] = await Promise.all([
    db.select({ messageId: messageMentions.messageId, userId: messageMentions.userId }).from(messageMentions).where(inArray(messageMentions.messageId, ids)),
    db.select({ id: messageAttachments.id, messageId: messageAttachments.messageId, fileName: messageAttachments.fileName, contentType: messageAttachments.contentType, sizeBytes: messageAttachments.sizeBytes })
      .from(messageAttachments).where(inArray(messageAttachments.messageId, ids)).orderBy(asc(messageAttachments.createdAt)),
  ]);
  const people = await namedUsers([...rows.map((r) => r.senderId), ...ments.map((m) => m.userId)]);
  return rows.map((r) => ({
    id: r.id,
    sender: people.get(r.senderId) ?? { ...FORMER, userId: r.senderId },
    body: r.body,
    at: r.createdAt.toISOString(),
    mentions: ments.filter((m) => m.messageId === r.id).map((m) => ({ userId: m.userId, name: people.get(m.userId)?.name ?? "Former login" })),
    attachments: files.filter((f) => f.messageId === r.id).map((f) => ({ id: f.id, fileName: f.fileName, contentType: f.contentType, sizeBytes: f.sizeBytes })),
  }));
}

export async function listThreadMessages(threadId: string, limit = 500): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
    .from(messages).where(eq(messages.threadId, threadId)).orderBy(desc(messages.createdAt)).limit(limit);
  return enrich(rows.reverse());
}

export async function listDmMessages(meId: string, otherId: string, limit = 500): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .where(and(isNull(messages.threadId), or(
      and(eq(messages.senderId, meId), eq(messages.recipientId, otherId)),
      and(eq(messages.senderId, otherId), eq(messages.recipientId, meId)),
    )))
    .orderBy(desc(messages.createdAt)).limit(limit);
  return enrich(rows.reverse());
}

export interface MentionItem {
  messageId: string;
  at: string;
  body: string;
  sender: MessageContact;
  /** Where the mention happened: a direct message from someone, or a thread. */
  dmWith: string | null;
  threadId: string | null;
  threadTitle: string | null;
  channelName: string | null;
  unread: boolean;
}

/** Messages that @-mention this person, newest first, limited to what they can still read. */
export async function listMentions(me: Me, limit = 100): Promise<MentionItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: messages.id, senderId: messages.senderId, recipientId: messages.recipientId, threadId: messages.threadId, body: messages.body, createdAt: messages.createdAt, readAt: messages.readAt })
    .from(messageMentions)
    .innerJoin(messages, eq(messageMentions.messageId, messages.id))
    .where(and(eq(messageMentions.userId, me.userId), ne(messages.senderId, me.userId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  const channels = await visibleChannels(me);
  const chById = new Map(channels.map((c) => [c.id, c]));
  const threadIds = [...new Set(rows.map((r) => r.threadId).filter((x): x is string => Boolean(x)))];
  const threads = threadIds.length ? await db.select().from(chatThreads).where(inArray(chatThreads.id, threadIds)) : [];
  const reads = threadIds.length ? await db.select().from(chatReads).where(and(eq(chatReads.userId, me.userId), inArray(chatReads.threadId, threadIds))) : [];
  const tById = new Map(threads.map((t) => [t.id, t]));
  const readBy = new Map(reads.map((r) => [r.threadId, r.lastReadAt]));
  const people = await namedUsers(rows.map((r) => r.senderId));
  const out: MentionItem[] = [];
  for (const r of rows) {
    if (r.threadId) {
      const t = tById.get(r.threadId);
      const ch = t ? chById.get(t.channelId) : undefined;
      if (!t || !ch) continue;
      const seen = readBy.get(r.threadId);
      out.push({ messageId: r.id, at: r.createdAt.toISOString(), body: r.body, sender: people.get(r.senderId) ?? FORMER, dmWith: null, threadId: t.id, threadTitle: t.title, channelName: ch.name, unread: !seen || seen < r.createdAt });
    } else if (r.recipientId === me.userId) {
      out.push({ messageId: r.id, at: r.createdAt.toISOString(), body: r.body, sender: people.get(r.senderId) ?? FORMER, dmWith: r.senderId, threadId: null, threadTitle: null, channelName: null, unread: !r.readAt });
    }
  }
  return out;
}

/** Everything unread for this person: direct messages to them plus unread posts in threads they can see. */
export async function countUnread(me: Me): Promise<number> {
  const db = await getDb();
  const [dm] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(isNull(messages.threadId), eq(messages.recipientId, me.userId), isNull(messages.readAt)));
  const channels = await visibleChannels(me);
  const threads = await listThreadSummaries(me, channels.map((c) => c.id));
  return (dm?.n ?? 0) + threads.reduce((n, t) => n + t.unread, 0);
}
