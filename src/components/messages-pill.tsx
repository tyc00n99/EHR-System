"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/kit";

/**
 * The Messages door (user's pick "C", Oct 16, 2026): a pill pinned bottom-left, mirroring the
 * corner hub on the right: blue circle, unread badge, "Messages" and a line. Home only (user,
 * Oct 18); every other page reaches Messages through the hub. On phones it is the circle alone.
 */
export function MessagesPill({ unread }: { unread: number }) {
  const path = usePathname();
  if (path !== "/") return null;
  const label = unread ? `Messages, ${unread} unread` : "Messages";
  return (
    <Link
      href="/messages"
      aria-label={label}
      title="Messages"
      className={cx(
        "fixed bottom-7 left-7 z-30 flex items-center gap-3 rounded-full border border-line bg-card shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition-colors hover:bg-tab-hover",
        "h-16 p-[9px] md:pr-6",
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
      <span className="hidden leading-[1.2] md:block">
        <span className="block text-[16px] font-semibold text-text-strong">Messages</span>
        <span className="block text-[13px] text-text">{unread ? `${unread} unread` : "You are all caught up"}</span>
      </span>
    </Link>
  );
}
