import type { Metadata } from "next";
import { listConversations, listMessageContacts, listThread } from "@/db/message-queries";
import { requireUser } from "@/lib/auth";
import { Messenger } from "./messenger";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const user = await requireUser();
  const { with: withId } = await searchParams;
  const me = { userId: user.id, role: user.role };
  const [conversations, contacts] = await Promise.all([listConversations(me), listMessageContacts(me)]);
  const openWith = withId && contacts.some((c) => c.userId === withId) ? withId : conversations.some((c) => c.contact.userId === withId) ? withId! : null;
  const thread = openWith ? await listThread(user.id, openWith) : [];
  const openContact = openWith
    ? contacts.find((c) => c.userId === openWith) ?? conversations.find((c) => c.contact.userId === openWith)?.contact ?? null
    : null;
  return (
    <Messenger
      meId={user.id}
      meName={user.staffName ?? user.email}
      conversations={conversations.map((c) => ({ ...c, lastAt: c.lastAt.toISOString() }))}
      contacts={contacts}
      open={openContact}
      thread={thread.map((m) => ({ id: m.id, senderId: m.senderId, body: m.body, at: m.createdAt.toISOString() }))}
    />
  );
}
