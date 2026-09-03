"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Check, FileUp, UserPlus, Users } from "lucide-react";
import { cx } from "@/components/kit";

const KEY = "ehr.home.getstarted";

export interface SetupStep { key: string; done: boolean }

const CARDS = [
  { key: "clients", title: "Add a client", body: "PMI, waiver, emergency contact, and signing code.", href: "/clients/new", Icon: Users },
  { key: "staff", title: "Add staff", body: "Credentials, pay rate, and a login for the phone.", href: "/staff/new", Icon: UserPlus },
  { key: "agreements", title: "Upload a service agreement", body: "Drop the DHS letter and let it fill in the authorization.", href: "/clients", Icon: FileUp },
  { key: "shifts", title: "Schedule the week", body: "Assign caregivers to clients so the day is already planned.", href: "/scheduling", Icon: CalendarDays },
];

/** Neon-style "get connected" row: four cards, each a first step, dismissible once the agency is set up. */
export function GetStarted({ steps }: { steps: SetupStep[] }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => { try { setHidden(localStorage.getItem(KEY) === "dismissed"); } catch { setHidden(false); } });
    return () => cancelAnimationFrame(id);
  }, []);
  if (hidden) return null;
  const done = new Set(steps.filter((s) => s.done).map((s) => s.key));
  return (
    <section className="mb-6 rounded-[var(--radius-app)] border border-line bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px]">Get your agency running</h3>
        <button onClick={() => { setHidden(true); try { localStorage.setItem(KEY, "dismissed"); } catch {} }} className="text-[13px] font-medium text-primary hover:underline">Dismiss</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => {
          const ok = done.has(c.key);
          return (
            <Link key={c.key} href={c.href} className={cx("group rounded-md border border-line bg-panel p-4 transition-colors hover:border-gray-400", ok && "opacity-80")}>
              <div className="flex items-center gap-2.5">
                <span className={cx("flex h-7 w-7 items-center justify-center rounded-md", ok ? "bg-ok-soft text-ok" : "bg-hover text-text-strong")}>{ok ? <Check className="size-4" /> : <c.Icon className="size-4" />}</span>
                <span className="text-[14px] font-semibold text-text-strong">{c.title}</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-5 text-muted-foreground">{c.body}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
