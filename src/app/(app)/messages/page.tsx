import type { Metadata } from "next";
import {
  channelAudience, ensureChannelHome, ensureClientChannels, isOffice, listConversations, listDmMessages, listMentions,
  listMessageContacts, listOnShift, listThreadMessages, messageById, listThreadSummaries, threadFor, visibleChannels, type Me, type MessageContact,
} from "@/db/message-queries";
import { hasAbility } from "@/lib/abilities";
import { requireUser } from "@/lib/auth";
import { nowMs } from "@/lib/format";
import { Messenger, type OpenView } from "./messenger";

export const metadata: Metadata = { title: "Messages" };

type Tab = "home" | "recent" | "unread" | "me";

/**
 * Messages (Oct 16, 2026, rebuilt on the user's Slack-style reference): direct messages and
 * channels down the left, with Home / Recent / Unread / @me tabs; the open conversation on the
 * right. The URL is the state: `?dm=<userId>` or `?thread=<id>`, plus `?tab=`. `?with=` is the
 * older name for `?dm=` and still works.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string; dm?: string; thread?: string; channel?: string; tab?: string; side?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const me: Me = { userId: user.id, role: user.role, abilities: user.abilities, staffId: user.staffId };
  const tab: Tab = sp.tab === "recent" || sp.tab === "unread" || sp.tab === "me" ? sp.tab : "home";

  await ensureClientChannels(user.id);
  // Who is working today: office staff only, since a caregiver messages management, not colleagues.
  const [conversations, contacts, channels, mentions, onShift] = await Promise.all([
    listConversations(me), listMessageContacts(me), visibleChannels(me), listMentions(me), isOffice(me) ? listOnShift() : Promise.resolve([]),
  ]);
  const threads = await listThreadSummaries(me, channels.map((c) => c.id));

  let open: OpenView = null;
  const dmId = sp.dm ?? sp.with;
  // A channel opens its own conversation (its empty-titled thread), created on first open.
  const threadId = dmId ? null : sp.thread ?? (sp.channel ? await ensureChannelHome(me, sp.channel) : null);
  if (threadId) {
    const t = await threadFor(me, threadId);
    if (t) {
      const [msgs, audience, parent] = await Promise.all([listThreadMessages(t.id, user.id), channelAudience(t.channel.id), t.parentMessageId ? messageById(t.parentMessageId, user.id) : null]);
      open = { kind: "thread", thread: t, messages: parent ? [parent, ...msgs] : msgs, audience: audience.filter((p) => p.userId !== user.id) };
    }
  } else if (dmId) {
    const contact: MessageContact | null =
      contacts.find((c) => c.userId === dmId) ?? conversations.find((c) => c.contact.userId === dmId)?.contact ?? null;
    if (contact) open = { kind: "dm", contact, canReply: contacts.some((c) => c.userId === dmId), messages: await listDmMessages(user.id, dmId) };
  }

  // "Reply in thread" opens that thread beside the conversation (`?side=<threadId>`).
  let side: OpenView = null;
  if (sp.side && open && sp.side !== threadId) {
    const t = await threadFor(me, sp.side);
    if (t) {
      const [msgs, audience, parent] = await Promise.all([listThreadMessages(t.id, user.id), channelAudience(t.channel.id), t.parentMessageId ? messageById(t.parentMessageId, user.id) : null]);
      side = { kind: "thread", thread: t, messages: parent ? [parent, ...msgs] : msgs, audience: audience.filter((p) => p.userId !== user.id) };
    }
  }

  return (
    <Messenger
      meId={user.id}
      now={nowMs()}
      tab={tab}
      dms={conversations.map((c) => ({ ...c, lastAt: c.lastAt.toISOString() }))}
      contacts={contacts}
      channels={channels}
      threads={threads}
      mentions={mentions}
      onShift={onShift}
      canSchedule={hasAbility(user.abilities, "schedule")}
      canSwap={Boolean(user.staffId)}
      open={open}
      side={side}
    />
  );
}
