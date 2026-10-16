import type { Metadata } from "next";
import {
  canCreateChannels, channelAudience, listConversations, listDmMessages, listMentions, listMessageContacts,
  listThreadMessages, listThreadSummaries, threadFor, visibleChannels, type Me, type MessageContact,
} from "@/db/message-queries";
import { requireUser } from "@/lib/auth";
import { Messenger, type OpenView } from "./messenger";

export const metadata: Metadata = { title: "Messages" };

type Tab = "home" | "recent" | "unread" | "me";

/**
 * Messages (Oct 16, 2026, rebuilt on the user's Slack-style reference): direct messages and
 * channels down the left, with Home / Recent / Unread / @me tabs; the open conversation on the
 * right. The URL is the state: `?dm=<userId>` or `?thread=<id>`, plus `?tab=`. `?with=` is the
 * older name for `?dm=` and still works.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string; dm?: string; thread?: string; tab?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const me: Me = { userId: user.id, role: user.role, abilities: user.abilities };
  const tab: Tab = sp.tab === "recent" || sp.tab === "unread" || sp.tab === "me" ? sp.tab : "home";

  const [conversations, contacts, channels, mentions] = await Promise.all([
    listConversations(me), listMessageContacts(me), visibleChannels(me), listMentions(me),
  ]);
  const threads = await listThreadSummaries(me, channels.map((c) => c.id));

  let open: OpenView = null;
  const dmId = sp.dm ?? sp.with;
  if (sp.thread) {
    const t = await threadFor(me, sp.thread);
    if (t) {
      const [msgs, audience] = await Promise.all([listThreadMessages(t.id), channelAudience(t.channel.id)]);
      open = { kind: "thread", thread: t, messages: msgs, audience: audience.filter((p) => p.userId !== user.id) };
    }
  } else if (dmId) {
    const contact: MessageContact | null =
      contacts.find((c) => c.userId === dmId) ?? conversations.find((c) => c.contact.userId === dmId)?.contact ?? null;
    if (contact) open = { kind: "dm", contact, canReply: contacts.some((c) => c.userId === dmId), messages: await listDmMessages(user.id, dmId) };
  }

  return (
    <Messenger
      meId={user.id}
      now={Date.now()}
      tab={tab}
      canCreateChannels={canCreateChannels(me)}
      dms={conversations.map((c) => ({ ...c, lastAt: c.lastAt.toISOString() }))}
      contacts={contacts}
      channels={channels}
      threads={threads}
      mentions={mentions}
      open={open}
    />
  );
}
