"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/kit";

/**
 * The Messages door (user's pick "C", Oct 16, 2026): a pill pinned bottom-left, mirroring the
 * corner hub on the right. Full — blue circle, unread badge, "Messages" and a line — on Home;
 * shrunk to the circle alone on the other main pages; drawn nowhere else
 * (user, Oct 16). On phones it is always the circle, so it never crowds the hub.
 */
export function MessagesPill({ unread }: { unread: number }) {
  const path = usePathname();
  const full = path === "/";
  // The other main pages (the hub's destinations, by exact path): the circle alone. Records and
  // deeper screens, and Messages itself, get nothing.
  const compact = ["/clients", "/staff", "/scheduling", "/visits", "/evv", "/billing", "/attention", "/clock"].includes(path);
  if (!full && !compact) return null;
  const label = unread ? `Messages, ${unread} unread` : "Messages";
  return (
    <Link
      href="/messages"
      aria-label={label}
      title="Messages"
      className={cx(
        "fixed bottom-7 left-7 z-30 flex items-center gap-3 rounded-full border border-line bg-card shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition-colors hover:bg-tab-hover",
        full ? "h-16 p-[9px] md:pr-6" : "size-16 justify-center",
      )}
    >
      <span className="relative grid size-[46px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <MessageCircle className="size-6" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-danger px-1 text-[12px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </span>
      {full && (
        <span className="hidden leading-[1.2] md:block">
          <span className="block text-[16px] font-semibold text-text-strong">Messages</span>
          <span className="block text-[13px] text-text">{unread ? `${unread} unread` : "You are all caught up"}</span>
        </span>
      )}
    </Link>
  );
}
