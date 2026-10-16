"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { canCreateChannels, channelAudience, channelFor, channelMemberIds, threadFor, type Me } from "@/db/message-queries";
import { putFile } from "@/lib/storage";
import { requireUser, type CurrentUser } from "@/lib/auth";

const MAX_BODY = 4000;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TITLE = 120;
const ICONS = ["chat", "calendar", "money", "team", "shield", "home", "heart", "wrench", "clipboard", "bell"] as const;
const TINTS = ["primary", "ok", "warn", "danger", "neutral"] as const;

type Result<T = object> = ({ ok: true } & T) | { error: string };

const meOf = (u: CurrentUser): Me => ({ userId: u.id, role: u.role, abilities: u.abilities });

/** Can `me` send a direct message to `recipientId`? Caregivers write to management only. */
async function dmProblem(me: CurrentUser, recipientId: string): Promise<string | null> {
  if (recipientId === me.id) return "That is you.";
  const db = await getDb();
  const [r] = await db.select({ role: schema.users.role, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, recipientId));
  if (!r || !r.active) return "That person no longer has a login.";
  if (me.role === "dsp" && r.role === "dsp") return "Caregivers message management, not each other.";
  return null;
}

/**
 * Post a message, to a person (`to`) or into a channel thread (`thread`), with optional @mentions
 * (`mentions`, a JSON list of user ids) and files (`files`). Every row is written through
 * `audited` in one transaction: a body or a file can name a client.
 */
export async function postMessage(form: FormData): Promise<Result> {
  const user = await requireUser();
  const me = meOf(user);
  const to = String(form.get("to") ?? "") || null;
  const threadId = String(form.get("thread") ?? "") || null;
  const text = String(form.get("body") ?? "").trim();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!text && files.length === 0) return { error: "Write a message or attach a file first." };
  if (text.length > MAX_BODY) return { error: `Keep a message under ${MAX_BODY} characters.` };
  if (files.length > MAX_FILES) return { error: `Attach up to ${MAX_FILES} files at a time.` };
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return { error: `${big.name} is over 10 MB.` };
  if (Boolean(to) === Boolean(threadId)) return { error: "Choose a person or a thread." };

  // Who may be mentioned: the person on the other end, or whoever can read the thread.
  let allowed: Set<string>;
  if (to) {
    const problem = await dmProblem(user, to);
    if (problem) return { error: problem };
    allowed = new Set([to]);
  } else {
    const t = await threadFor(me, threadId!);
    if (!t) return { error: "That thread is not open to you." };
    allowed = new Set((await channelAudience(t.channel.id)).map((p) => p.userId));
  }
  let mentionIds: string[] = [];
  try { mentionIds = (JSON.parse(String(form.get("mentions") ?? "[]")) as unknown[]).filter((x): x is string => typeof x === "string"); } catch { /* none */ }
  mentionIds = [...new Set(mentionIds)].filter((id) => id !== user.id && allowed.has(id));

  const db = await getDb();
  const bytes = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const msg = await w.insert(schema.messages, { senderId: user.id, recipientId: to, threadId, body: text });
    for (const id of mentionIds) await w.insert(schema.messageMentions, { messageId: msg.id, userId: id });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
      const path = `messages/${msg.id}/${randomUUID()}-${safe}`;
      await putFile(path, bytes[i], f.type || "application/octet-stream", tx);
      await w.insert(schema.messageAttachments, { messageId: msg.id, path, fileName: f.name.slice(0, 200), contentType: f.type || "application/octet-stream", sizeBytes: f.size });
    }
    if (threadId) {
      await w.update(schema.chatThreads, threadId, { lastMessageAt: msg.createdAt });
      await tx.insert(schema.chatReads).values({ threadId, userId: user.id, lastReadAt: msg.createdAt })
        .onConflictDoUpdate({ target: [schema.chatReads.threadId, schema.chatReads.userId], set: { lastReadAt: msg.createdAt } });
    }
  });
  revalidatePath("/messages");
  return { ok: true };
}

/** Mark everything the other person sent me as read. Audited per row, like every write to a PHI table. */
export async function markThreadRead(otherId: string): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const unread = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(and(isNull(schema.messages.threadId), eq(schema.messages.senderId, otherId), eq(schema.messages.recipientId, user.id), isNull(schema.messages.readAt)));
  if (unread.length === 0) return;
  const writer = audited(db, { userId: user.id });
  const at = new Date();
  for (const m of unread) await writer.update(schema.messages, m.id, { readAt: at });
  revalidatePath("/messages");
}

/** Move my read marker on a channel thread to now. Bookkeeping, not PHI, so not audited. */
export async function markChatThreadRead(threadId: string): Promise<void> {
  const user = await requireUser();
  if (!(await threadFor(meOf(user), threadId))) return;
  const db = await getDb();
  const at = new Date();
  await db.insert(schema.chatReads).values({ threadId, userId: user.id, lastReadAt: at })
    .onConflictDoUpdate({ target: [schema.chatReads.threadId, schema.chatReads.userId], set: { lastReadAt: at } });
  revalidatePath("/messages");
}

/** Start a thread in a channel with its first message. Anyone who can read the channel may. */
export async function createThread(form: FormData): Promise<Result<{ threadId: string }>> {
  const user = await requireUser();
  const channelId = String(form.get("channel") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!title) return { error: "Give the thread a name." };
  if (title.length > MAX_TITLE) return { error: `Keep the name under ${MAX_TITLE} characters.` };
  if (!body) return { error: "Write the first message." };
  if (body.length > MAX_BODY) return { error: `Keep a message under ${MAX_BODY} characters.` };
  if (!(await channelFor(meOf(user), channelId))) return { error: "That channel is not open to you." };
  const db = await getDb();
  const threadId = await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const t = await w.insert(schema.chatThreads, { channelId, title, startedBy: user.id });
    const msg = await w.insert(schema.messages, { senderId: user.id, threadId: t.id, body });
    await w.update(schema.chatThreads, t.id, { lastMessageAt: msg.createdAt });
    await tx.insert(schema.chatReads).values({ threadId: t.id, userId: user.id, lastReadAt: msg.createdAt });
    return t.id;
  });
  revalidatePath("/messages");
  return { ok: true, threadId };
}

/** Rename a thread: whoever started it, or a channel manager. */
export async function renameThread(threadId: string, title: string): Promise<Result> {
  const user = await requireUser();
  const t = await threadFor(meOf(user), threadId);
  if (!t) return { error: "That thread is not open to you." };
  const name = title.trim();
  if (!name || name.length > MAX_TITLE) return { error: `Use a name of 1 to ${MAX_TITLE} characters.` };
  const db = await getDb();
  const [row] = await db.select({ startedBy: schema.chatThreads.startedBy }).from(schema.chatThreads).where(eq(schema.chatThreads.id, threadId));
  if (row?.startedBy !== user.id && !t.channel.canManage) return { error: "Only whoever started the thread, or a channel manager, can rename it." };
  await audited(db, { userId: user.id }).update(schema.chatThreads, threadId, { title: name });
  revalidatePath("/messages");
  return { ok: true };
}

interface ChannelInput { name: string; icon: string; tint: string; isPrivate: boolean; memberIds: string[] }

function cleanChannel(input: ChannelInput): ChannelInput | string {
  const name = input.name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_]/g, "");
  if (!name) return "Give the channel a name.";
  if (name.length > 40) return "Keep the channel name under 40 characters.";
  return {
    name,
    icon: (ICONS as readonly string[]).includes(input.icon) ? input.icon : "chat",
    tint: (TINTS as readonly string[]).includes(input.tint) ? input.tint : "primary",
    isPrivate: Boolean(input.isPrivate),
    memberIds: [...new Set(input.memberIds)],
  };
}

async function activeUserIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(and(inArray(schema.users.id, ids), eq(schema.users.active, true)));
  return rows.map((r) => r.id);
}

/** Create a channel. The creator is always a member. */
export async function createChannel(input: ChannelInput): Promise<Result<{ channelId: string }>> {
  const user = await requireUser();
  if (!canCreateChannels(meOf(user))) return { error: "Ask an administrator to create channels." };
  const c = cleanChannel(input);
  if (typeof c === "string") return { error: c };
  const members = await activeUserIds([...new Set([user.id, ...c.memberIds])]);
  const db = await getDb();
  const channelId = await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const ch = await w.insert(schema.chatChannels, { name: c.name, icon: c.icon, tint: c.tint, isPrivate: c.isPrivate, createdBy: user.id });
    for (const id of members) await w.insert(schema.chatChannelMembers, { channelId: ch.id, userId: id, addedBy: user.id });
    return ch.id;
  });
  revalidatePath("/messages");
  return { ok: true, channelId };
}

/** Change a channel's name, look, lock and members. Members not in the new list are removed. */
export async function updateChannel(channelId: string, input: ChannelInput): Promise<Result> {
  const user = await requireUser();
  const ch = await channelFor(meOf(user), channelId);
  if (!ch?.canManage) return { error: "Only a channel manager can change this channel." };
  const c = cleanChannel(input);
  if (typeof c === "string") return { error: c };
  const wanted = new Set(await activeUserIds(c.memberIds));
  const current = await channelMemberIds(channelId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    await w.update(schema.chatChannels, channelId, { name: c.name, icon: c.icon, tint: c.tint, isPrivate: c.isPrivate });
    for (const id of wanted) if (!current.includes(id)) await w.insert(schema.chatChannelMembers, { channelId, userId: id, addedBy: user.id });
    const rows = await tx.select({ id: schema.chatChannelMembers.id, userId: schema.chatChannelMembers.userId }).from(schema.chatChannelMembers).where(eq(schema.chatChannelMembers.channelId, channelId));
    for (const r of rows) if (!wanted.has(r.userId)) await w.delete(schema.chatChannelMembers, r.id);
  });
  revalidatePath("/messages");
  return { ok: true };
}

/** Archive a channel: it leaves everyone's list, and its threads stay in the database and the audit log. */
export async function archiveChannel(channelId: string): Promise<Result> {
  const user = await requireUser();
  const ch = await channelFor(meOf(user), channelId);
  if (!ch?.canManage) return { error: "Only a channel manager can archive this channel." };
  const db = await getDb();
  await audited(db, { userId: user.id }).update(schema.chatChannels, channelId, { archivedAt: new Date() });
  revalidatePath("/messages");
  return { ok: true };
}

/** Join an open channel (office staff), so it is listed as mine. */
export async function joinChannel(channelId: string): Promise<Result> {
  const user = await requireUser();
  const ch = await channelFor(meOf(user), channelId);
  if (!ch) return { error: "That channel is not open to you." };
  if (ch.isMember) return { ok: true };
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.chatChannelMembers, { channelId, userId: user.id, addedBy: user.id });
  revalidatePath("/messages");
  return { ok: true };
}
