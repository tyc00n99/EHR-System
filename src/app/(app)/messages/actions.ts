"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { canCreateChannels, channelAudience, channelFor, channelMemberIds, listSwapOptions, threadFor, type Me, type SwapOption } from "@/db/message-queries";
import { hasAbility } from "@/lib/abilities";
import { checkEligibility, hasClash } from "@/lib/shift-eligibility";
import { putFile } from "@/lib/storage";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { REACTIONS } from "./reactions";
import { MAX_FILE_BYTES, MAX_FILES, pendingPrefix } from "./upload/shared";

const MAX_BODY = 4000;
const MAX_TITLE = 120;

/** A file the composer already uploaded in parts (see `upload/route.ts`), named by its upload id. */
interface Upload { id: string; name: string; type: string; size: number }

function readUploads(raw: string): Upload[] | string {
  let list: unknown;
  try { list = JSON.parse(raw || "[]"); } catch { return "The attachments could not be read. Remove them and attach again."; }
  if (!Array.isArray(list)) return "The attachments could not be read. Remove them and attach again.";
  const out: Upload[] = [];
  for (const u of list as Partial<Upload>[]) {
    if (typeof u?.id !== "string" || !/^[0-9a-f-]{36}$/.test(u.id) || typeof u.name !== "string" || typeof u.size !== "number") return "The attachments could not be read. Remove them and attach again.";
    out.push({ id: u.id, name: u.name, type: typeof u.type === "string" && u.type ? u.type : "application/octet-stream", size: u.size });
  }
  return out;
}
const ICONS = ["chat", "calendar", "money", "team", "shield", "home", "heart", "wrench", "clipboard", "bell"] as const;
const TINTS = ["primary", "ok", "warn", "danger", "neutral"] as const;

type Result<T = object> = ({ ok: true } & T) | { error: string };

const meOf = (u: CurrentUser): Me => ({ userId: u.id, role: u.role, abilities: u.abilities, staffId: u.staffId });

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
 * (`mentions`, a JSON list of user ids) and files (`uploads`, a JSON list of uploads the composer
 * already sent in parts). Every row is written through `audited` in one transaction: a body or a
 * file can name a client. The parts are joined inside that transaction, so a message never points
 * at a file that is not there.
 */
export async function postMessage(form: FormData): Promise<Result> {
  const user = await requireUser();
  const me = meOf(user);
  const to = String(form.get("to") ?? "") || null;
  const threadId = String(form.get("thread") ?? "") || null;
  const text = String(form.get("body") ?? "").trim();
  const files = readUploads(String(form.get("uploads") ?? "[]"));
  if (typeof files === "string") return { error: files };
  if (!text && files.length === 0) return { error: "Write a message or attach a file first." };
  if (text.length > MAX_BODY) return { error: `Keep a message under ${MAX_BODY} characters.` };
  if (files.length > MAX_FILES) return { error: `Attach up to ${MAX_FILES} files at a time.` };
  const big = files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return { error: `${big.name} is over 10 MB.` };
  if (Boolean(to) === Boolean(threadId)) return { error: "Choose a person or a thread." };
  // A voice note is its recording plus the transcript as the body (the transcript may be empty
  // when the browser cannot transcribe); it must carry exactly one audio file.
  const kind = form.get("kind") === "voice" ? "voice" : "text";
  if (kind === "voice" && (files.length !== 1 || !files[0].type.startsWith("audio/"))) return { error: "The voice note did not record. Try again." };

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
  // Join each upload's parts, in order. Only this person's pending parts are read, so an upload id
  // from someone else's composer finds nothing.
  const joined: Uint8Array[] = [];
  for (const f of files) {
    const prefix = `${pendingPrefix(user.id)}${f.id}/`;
    const parts = await db.select({ bytes: schema.storedFiles.bytes }).from(schema.storedFiles).where(like(schema.storedFiles.path, `${prefix}%`)).orderBy(asc(schema.storedFiles.path));
    const chunks = parts.map((p) => (p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes as ArrayBuffer)));
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    if (chunks.length === 0 || total !== f.size) return { error: `${f.name} did not finish uploading. Remove it and attach it again.` };
    const whole = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { whole.set(c, at); at += c.byteLength; }
    joined.push(whole);
  }
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const msg = await w.insert(schema.messages, { senderId: user.id, recipientId: to, threadId, body: text, kind });
    for (const id of mentionIds) await w.insert(schema.messageMentions, { messageId: msg.id, userId: id });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const safe = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
      const path = `messages/${msg.id}/${randomUUID()}-${safe}`;
      await putFile(path, joined[i], f.type, tx);
      await w.insert(schema.messageAttachments, { messageId: msg.id, path, fileName: f.name.slice(0, 200), contentType: f.type, sizeBytes: f.size });
      await tx.delete(schema.storedFiles).where(like(schema.storedFiles.path, `${pendingPrefix(user.id)}${f.id}/%`));
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
  if (ch.isMember || ch.personId) return { ok: true }; // a client's channel follows assignments, not a member list
  const db = await getDb();
  await audited(db, { userId: user.id }).insert(schema.chatChannelMembers, { channelId, userId: user.id, addedBy: user.id });
  revalidatePath("/messages");
  return { ok: true };
}

/* ---------------------------------------------------------------------------------------------
 * Reactions, reply threads and shift swaps (Oct 18, 2026).
 * ------------------------------------------------------------------------------------------- */

/** The message, if this person can read it: either end of a direct message, or anyone who can open its thread. */
async function readable(user: CurrentUser, messageId: string) {
  const db = await getDb();
  const [m] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId)).limit(1);
  if (!m) return null;
  if (m.threadId) {
    const t = await threadFor(meOf(user), m.threadId);
    return t ? { message: m, thread: t } : null;
  }
  return m.senderId === user.id || m.recipientId === user.id ? { message: m, thread: null } : null;
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]>[0];

async function touch(tx: Tx, threadId: string, userId: string, at: Date) {
  await audited(tx, { userId }).update(schema.chatThreads, threadId, { lastMessageAt: at });
  await tx.insert(schema.chatReads).values({ threadId, userId, lastReadAt: at })
    .onConflictDoUpdate({ target: [schema.chatReads.threadId, schema.chatReads.userId], set: { lastReadAt: at } });
}

/** Add my reaction, or take it back if I already gave that one. */
export async function toggleReaction(messageId: string, emoji: string): Promise<Result> {
  const user = await requireUser();
  if (!(REACTIONS as readonly string[]).includes(emoji)) return { error: "That reaction is not offered." };
  if (!(await readable(user, messageId))) return { error: "That message is not open to you." };
  const db = await getDb();
  const [row] = await db.select({ id: schema.messageReactions.id }).from(schema.messageReactions)
    .where(and(eq(schema.messageReactions.messageId, messageId), eq(schema.messageReactions.userId, user.id), eq(schema.messageReactions.emoji, emoji)));
  const w = audited(db, { userId: user.id });
  if (row) await w.delete(schema.messageReactions, row.id);
  else await w.insert(schema.messageReactions, { messageId, userId: user.id, emoji });
  revalidatePath("/messages");
  return { ok: true };
}

/**
 * "Reply in thread" on a message in a channel: opens the thread hanging off that message, starting
 * it the first time. Its name is the start of the message, so it reads sensibly in the channel's
 * thread list. A direct message has no channel, so it has no threads.
 */
export async function replyInThread(messageId: string): Promise<Result<{ threadId: string }>> {
  const user = await requireUser();
  const r = await readable(user, messageId);
  if (!r) return { error: "That message is not open to you." };
  if (!r.thread) return { error: "Threads live in channels. Reply here instead." };
  const db = await getDb();
  const [existing] = await db.select({ id: schema.chatThreads.id }).from(schema.chatThreads).where(eq(schema.chatThreads.parentMessageId, messageId)).limit(1);
  if (existing) return { ok: true, threadId: existing.id };
  const words = r.message.body.replace(/\s+/g, " ").trim();
  const title = words ? (words.length > 60 ? `${words.slice(0, 57).trimEnd()}…` : words) : r.message.kind === "voice" ? "Voice note" : "Attachment";
  const t = await audited(db, { userId: user.id }).insert(schema.chatThreads, { channelId: r.thread.channel.id, title, startedBy: user.id, parentMessageId: messageId, lastMessageAt: r.message.createdAt })
    .catch(() => null); // somebody started it a moment ago (unique on parent_message_id)
  if (t) { revalidatePath("/messages"); return { ok: true, threadId: t.id }; }
  const [again] = await db.select({ id: schema.chatThreads.id }).from(schema.chatThreads).where(eq(schema.chatThreads.parentMessageId, messageId)).limit(1);
  return again ? { ok: true, threadId: again.id } : { error: "The thread could not be started. Try again." };
}

const fmtShift = (start: Date, end: Date) => {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" }).format(start);
  const t = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);
  return `${day} · ${t(start)} to ${t(end)}`;
};

/**
 * A caregiver offers one of their upcoming shifts to a colleague, as a card in the conversation.
 * The colleague must already be assigned to the client and oriented to them; someone who manages
 * the schedule approves it in the chat.
 */
export async function requestSwap(input: { shiftId: string; toStaffId: string; to?: string | null; thread?: string | null; note?: string }): Promise<Result> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Only a caregiver with shifts can ask to swap one." };
  if (Boolean(input.to) === Boolean(input.thread)) return { error: "Choose a person or a thread." };
  if (input.to) { const problem = await dmProblem(user, input.to); if (problem) return { error: problem }; }
  else if (!(await threadFor(meOf(user), input.thread!))) return { error: "That thread is not open to you." };
  const db = await getDb();
  const [s] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, input.shiftId)).limit(1);
  if (!s || s.staffId !== user.staffId) return { error: "That shift is not yours to offer." };
  if (s.status !== "scheduled" || s.startAt <= new Date()) return { error: "Only an upcoming scheduled shift can be swapped." };
  if (input.toStaffId === user.staffId) return { error: "Choose a colleague." };
  const ok = await checkEligibility(input.toStaffId, s.personId);
  if (ok.problem) return { error: ok.problem };
  const [pending] = await db.select({ id: schema.shiftSwaps.id }).from(schema.shiftSwaps).where(and(eq(schema.shiftSwaps.shiftId, s.id), eq(schema.shiftSwaps.status, "pending"))).limit(1);
  if (pending) return { error: "There is already a swap request open for that shift." };
  const [taker] = await db.select({ firstName: schema.staff.firstName, lastName: schema.staff.lastName }).from(schema.staff).where(eq(schema.staff.id, input.toStaffId));
  const note = (input.note ?? "").trim().slice(0, 500);
  const body = `Asked to swap ${fmtShift(s.startAt, s.endAt)} to ${taker?.firstName ?? ""} ${taker?.lastName ?? ""}`.trim() + (note ? `\n${note}` : "");
  await db.transaction(async (tx) => {
    const w = audited(tx, { userId: user.id });
    const msg = await w.insert(schema.messages, { senderId: user.id, recipientId: input.to ?? null, threadId: input.thread ?? null, body, kind: "swap" });
    await w.insert(schema.shiftSwaps, { messageId: msg.id, shiftId: s.id, fromStaffId: user.staffId!, toStaffId: input.toStaffId, requestedBy: user.id });
    if (input.thread) await touch(tx, input.thread, user.id, msg.createdAt);
  });
  revalidatePath("/messages");
  return { ok: true };
}

/**
 * Approve or decline a swap from the card. Approving re-checks that the shift is still the
 * requester's and still upcoming, that the colleague is assigned and oriented, and that they are
 * not already booked then, and moves the shift in the same transaction.
 */
export async function decideSwap(swapId: string, approve: boolean): Promise<Result<{ warning?: string }>> {
  const user = await requireUser();
  if (!hasAbility(user.abilities, "schedule")) return { error: "Only someone who manages the schedule can approve swaps." };
  const db = await getDb();
  const [w] = await db.select().from(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, swapId)).limit(1);
  if (!w || !(await readable(user, w.messageId))) return { error: "That request is not open to you." };
  if (w.status !== "pending") return { error: "That request has already been answered." };
  const [s] = await db.select().from(schema.shifts).where(eq(schema.shifts.id, w.shiftId)).limit(1);
  let warning: string | undefined;
  if (approve) {
    if (!s || s.staffId !== w.fromStaffId || s.status !== "scheduled" || s.startAt <= new Date()) return { error: "The shift has changed since this was asked. Check the schedule." };
    const ok = await checkEligibility(w.toStaffId, s.personId);
    if (ok.problem) return { error: ok.problem };
    if (await hasClash(w.toStaffId, s.startAt, s.endAt, s.id)) return { error: "They already have a shift at that time." };
    warning = ok.warning;
  }
  await db.transaction(async (tx) => {
    const a = audited(tx, { userId: user.id });
    if (approve && s) await a.update(schema.shifts, s.id, { staffId: w.toStaffId });
    await a.update(schema.shiftSwaps, w.id, { status: approve ? "approved" : "declined", decidedBy: user.id, decidedAt: new Date() });
  });
  revalidatePath("/messages");
  revalidatePath("/scheduling");
  revalidatePath("/");
  return { ok: true, warning };
}

/** Whoever asked can take a pending request back. */
export async function withdrawSwap(swapId: string): Promise<Result> {
  const user = await requireUser();
  const db = await getDb();
  const [w] = await db.select().from(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, swapId)).limit(1);
  if (!w || w.requestedBy !== user.id) return { error: "Only whoever asked can withdraw it." };
  if (w.status !== "pending") return { error: "That request has already been answered." };
  await audited(db, { userId: user.id }).update(schema.shiftSwaps, w.id, { status: "withdrawn", decidedBy: user.id, decidedAt: new Date() });
  revalidatePath("/messages");
  return { ok: true };
}

/** The shifts I can offer in this conversation, and who could take each (for the swap window). */
export async function swapOptions(personId: string | null): Promise<Result<{ options: SwapOption[] }>> {
  const user = await requireUser();
  if (!user.staffId) return { error: "Only a caregiver with shifts can ask to swap one." };
  return { ok: true, options: await listSwapOptions(user.staffId, personId) };
}
