"use client";

/** Small shared pieces of the Messages screen: avatars, channel tiles, times, mention-aware text. */
import { Banknote, Bell, CalendarDays, ClipboardList, Heart, House, MessageSquare, ShieldCheck, User, Users, Wrench, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cx } from "@/components/kit";

export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  chat: MessageSquare, calendar: CalendarDays, money: Banknote, team: Users, shield: ShieldCheck,
  home: House, heart: Heart, wrench: Wrench, clipboard: ClipboardList, bell: Bell,
  /** Reserved for a client's own channel; not offered when creating a channel. */
  person: User,
};
export const ICON_KEYS = Object.keys(CHANNEL_ICONS).filter((k) => k !== "person");

/** Soft tile tints, drawn from the app's own status tints so channels never bring in a new colour. */
export const TINTS: Record<string, string> = {
  primary: "bg-primary-soft text-primary",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-card-soft text-text-strong",
};
export const TINT_KEYS = Object.keys(TINTS);

export function ChannelTile({ icon, tint, size = 32 }: { icon: string; tint: string; size?: number }) {
  const Ic = CHANNEL_ICONS[icon] ?? MessageSquare;
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-lg", TINTS[tint] ?? TINTS.primary)} style={{ width: size, height: size }}>
      <Ic style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={1.8} />
    </span>
  );
}

export function Face({ initials, size = 44, badge }: { initials: string; size?: number; badge?: ReactNode }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span className="grid size-full place-items-center rounded-full bg-primary-soft font-semibold text-primary" style={{ fontSize: Math.max(13, size * 0.36) }}>{initials}</span>
      {badge && <span className="absolute -bottom-1 -right-1 rounded-lg ring-2 ring-card">{badge}</span>}
    </span>
  );
}

const ZONE = "America/Chicago";
export const dayOf = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
export const timeOf = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** "now", "4m", "2h", "3d", then a date. `now` is passed in so render stays pure. */
export function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, month: "short", day: "numeric" }).format(new Date(iso));
}

export function roleWord(c: { title: string | null; role: string }) {
  return c.title ?? (c.role === "admin" ? "Administrator" : c.role === "supervisor" ? "Supervisor" : "Direct support");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A message body with its @mentions drawn in the primary colour. Only names actually mentioned are marked. */
export function MentionText({ body, names, meName }: { body: string; names: string[]; meName?: string }) {
  if (names.length === 0) return <>{body}</>;
  const re = new RegExp(`(@(?:${names.map(escape).sort((a, b) => b.length - a.length).join("|")}))`, "g");
  return (
    <>
      {body.split(re).map((part, i) =>
        part.startsWith("@") && names.includes(part.slice(1))
          ? <span key={i} className={cx("font-semibold text-primary", part.slice(1) === meName && "rounded bg-primary-soft px-1")}>{part}</span>
          : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
