"use client";

/** The three windows Messages opens: pick a person, start a thread, and create or edit a channel. */
import { Check, Lock, Search } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { cx, Input, Select, Textarea } from "@/components/kit";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ChannelInfo, MessageContact } from "@/db/message-queries";
import { archiveChannel, createChannel, createThread, updateChannel } from "./actions";
import { ChannelTile, Face, ICON_KEYS, roleWord, TINT_KEYS } from "./chat-bits";

const BLUR = "bg-black/20 supports-backdrop-filter:backdrop-blur-sm";
const primaryBtn = "h-10 rounded-lg bg-primary px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50";
const plainBtn = "h-10 rounded-lg px-4 text-[15px] font-medium text-text hover:bg-tab-hover";

function Window({ title, onClose, width = "sm:max-w-[520px]", children }: { title: string; onClose: () => void; width?: string; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent overlayClassName={BLUR} className={cx("block max-h-[calc(100vh-3rem)] w-[calc(100%-2rem)] overflow-y-auto p-0", width)}>
        <DialogTitle className="border-b border-line px-6 py-4 text-[19px] font-semibold text-text-strong">{title}</DialogTitle>
        <div className="px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1.5 block text-[14px] font-medium text-text-strong">{children}</span>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex items-center justify-end gap-2">{children}</div>;
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={cx("grid size-5 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-line")}>
      {on && <Check className="size-3.5" />}
    </span>
  );
}

function PersonLine({ c, size = 36 }: { c: MessageContact; size?: number }) {
  return (
    <>
      <Face initials={c.initials} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium text-text-strong">{c.name}</span>
        <span className="block truncate text-[13px] text-muted">{roleWord(c)}</span>
      </span>
    </>
  );
}

function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

/* ---------- new direct message ---------- */

export function NewMessageDialog({ contacts, onClose, onPick }: { contacts: MessageContact[]; onClose: () => void; onPick: (userId: string) => void }) {
  const [q, setQ] = useState("");
  const list = contacts.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Window title="New direct message" onClose={onClose}>
      <SearchBox autoFocus value={q} onChange={setQ} placeholder="Find a person" />
      <div className="-mx-2 mt-3 max-h-[50vh] overflow-y-auto">
        {list.length === 0 && <p className="px-2 py-4 text-[15px] text-muted">Nobody by that name.</p>}
        {list.map((c) => (
          <button key={c.userId} onClick={() => onPick(c.userId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-tab-hover">
            <PersonLine c={c} />
          </button>
        ))}
      </div>
    </Window>
  );
}

/* ---------- new thread ---------- */

export function NewThreadDialog({ channels, channelId, onClose, onCreated }: { channels: ChannelInfo[]; channelId?: string; onClose: () => void; onCreated: (threadId: string) => void }) {
  const [channel, setChannel] = useState(channelId ?? channels[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  function save() {
    const form = new FormData();
    form.set("channel", channel);
    form.set("title", title);
    form.set("body", body);
    start(async () => {
      const r = await createThread(form);
      if ("error" in r) toast.error(r.error);
      else onCreated(r.threadId);
    });
  }
  return (
    <Window title="New thread" onClose={onClose}>
      <label className="block">
        <Label>Channel</Label>
        <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </label>
      <label className="mt-4 block">
        <Label>Thread name</Label>
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Weekend coverage" />
      </label>
      <label className="mt-4 block">
        <Label>First message</Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What is this thread about?" />
      </label>
      <Actions>
        <button className={plainBtn} onClick={onClose}>Cancel</button>
        <button className={primaryBtn} disabled={pending || !channel || !title.trim() || !body.trim()} onClick={save}>{pending ? "Starting…" : "Start thread"}</button>
      </Actions>
    </Window>
  );
}

/* ---------- channel create / settings ---------- */

export function ChannelDialog({ channel, contacts, meId, onClose, onSaved }: { channel?: ChannelInfo; contacts: MessageContact[]; meId: string; onClose: () => void; onSaved: () => void }) {
  const editing = Boolean(channel);
  const [name, setName] = useState(channel?.name ?? "");
  const [icon, setIcon] = useState(channel?.icon ?? "chat");
  const [tint, setTint] = useState(channel?.tint ?? "primary");
  const [isPrivate, setPrivate] = useState(channel?.isPrivate ?? false);
  // Whoever creates or edits the channel stays in it: they are not listed, so they cannot untick themselves out.
  const [members, setMembers] = useState<Set<string>>(() => new Set((channel?.memberIds ?? []).filter((id) => id !== meId)));
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  const list = contacts.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setMembers((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  function save() {
    const input = { name, icon, tint, isPrivate, memberIds: [...members, meId] };
    start(async () => {
      const r = editing ? await updateChannel(channel!.id, input) : await createChannel(input);
      if ("error" in r) toast.error(r.error);
      else { toast.success(editing ? "Channel saved." : "Channel created."); onSaved(); }
    });
  }

  function archive() {
    if (!channel || !window.confirm(`Archive ${channel.name}? It leaves everyone's list; its threads are kept.`)) return;
    start(async () => {
      const r = await archiveChannel(channel.id);
      if ("error" in r) toast.error(r.error);
      else { toast.success("Channel archived."); onSaved(); }
    });
  }

  return (
    <Window title={editing ? "Channel settings" : "New channel"} onClose={onClose} width="sm:max-w-[620px]">
      <div className="flex items-end gap-3">
        <ChannelTile icon={icon} tint={tint} size={44} />
        <label className="block flex-1">
          <Label>Name</Label>
          <Input autoFocus={!editing} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. scheduling" />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label>Icon</Label>
          <div className="flex flex-wrap gap-1.5">
            {ICON_KEYS.map((k) => (
              <button key={k} type="button" aria-label={k} aria-pressed={icon === k} onClick={() => setIcon(k)} className={cx("rounded-lg p-1", icon === k ? "ring-2 ring-primary" : "hover:bg-tab-hover")}>
                <ChannelTile icon={k} tint={tint} size={30} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Colour</Label>
          <div className="flex gap-1.5">
            {TINT_KEYS.map((t) => (
              <button key={t} type="button" aria-label={t} aria-pressed={tint === t} onClick={() => setTint(t)} className={cx("rounded-lg p-1", tint === t ? "ring-2 ring-primary" : "hover:bg-tab-hover")}>
                <ChannelTile icon={icon} tint={t} size={30} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setPrivate((p) => !p)} aria-pressed={isPrivate} className="mt-5 flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-tab-hover">
        <span className="mt-0.5"><Tick on={isPrivate} /></span>
        <span>
          <span className="flex items-center gap-1.5 text-[15px] font-medium text-text-strong"><Lock className="size-4" /> Private channel</span>
          <span className="mt-0.5 block text-[14px] text-text">Only the members below can see it. An open channel is also visible to every office login.</span>
        </span>
      </button>

      <div className="mt-5">
        <Label>Members · {members.size + 1}</Label>
        <SearchBox value={q} onChange={setQ} placeholder="Find people to add" />
        <div className="-mx-2 mt-2 max-h-64 overflow-y-auto">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2 opacity-70">
            <Tick on />
            <span className="text-[15px] text-text-strong">You</span>
          </div>
          {list.map((c) => (
            <button key={c.userId} type="button" onClick={() => toggle(c.userId)} aria-pressed={members.has(c.userId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-tab-hover">
              <Tick on={members.has(c.userId)} />
              <PersonLine c={c} size={30} />
            </button>
          ))}
        </div>
      </div>

      <Actions>
        {editing && <button className="mr-auto h-10 rounded-lg px-3 text-[15px] font-medium text-danger hover:bg-danger-soft" onClick={archive} disabled={pending}>Archive channel</button>}
        <button className={plainBtn} onClick={onClose}>Cancel</button>
        <button className={primaryBtn} disabled={pending || !name.trim()} onClick={save}>{pending ? "Saving…" : editing ? "Save" : "Create channel"}</button>
      </Actions>
    </Window>
  );
}
