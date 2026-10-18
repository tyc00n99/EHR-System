"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/kit";
import { useModulePanel } from "@/components/module-panel";
import { gearGroups, primaryNav, type Destination, type NavCounts } from "@/lib/nav";

/**
 * The corner hub (Sept 20, 2026, the user's pick over a sidebar): one round button in the
 * bottom-right corner is the whole primary navigation. Pressed — or ⌘ . — it fans the areas out in
 * a quarter circle with their names, and folds away when one is chosen (the digit keys still
 * choose a spoke, but the numbers are no longer drawn — user, Sept 20: redundant). The
 * button itself shows the icon of the area you are in, so it doubles as "where am I"; the control
 * centred in the strip says the same in words and, on a record, is the way back to the list.
 */

const Ctx = createContext<{ open: boolean; phone: boolean; setOpen: (v: boolean, phone?: boolean) => void; forget: () => void }>({ open: false, phone: false, setOpen: () => {}, forget: () => {} });

/**
 * The fan is open by default on the home page (user, Sept 21: a greeting with nothing to click
 * is a dead end) and closed everywhere else. A choice the person makes is remembered for the
 * path it was made on, so a route change falls back to the default without an effect.
 */
export function HubProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<{ path: string; open: boolean; phone?: boolean } | null>(null);
  const open = choice && choice.path === pathname ? choice.open : pathname === "/";
  // Phones never get the home page's default-open fan; only the tab bar's "More" opens it there.
  const phone = Boolean(choice && choice.path === pathname && choice.open && choice.phone);
  const setOpen = (v: boolean, fromPhone?: boolean) => setChoice({ path: pathname, open: v, phone: fromPhone });
  // Arriving at home again should open the fan again, so the home button forgets the last choice.
  const forget = () => setChoice(null);
  return <Ctx.Provider value={{ open, phone, setOpen, forget }}>{children}</Ctx.Provider>;
}

/** The home button in the strip: a house on the soft tint, the agency's name beside it on desktop. */
export function HomeLink({ orgName }: { orgName: string }) {
  const { forget } = useHub();
  return (
    <Link href="/" aria-label={`${orgName} home`} title="Home" onClick={forget} className="flex h-9 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-text-strong hover:bg-tab-hover">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-text-strong"><Icon.home size={16} /></span>
      <span className="hidden text-[15px] font-semibold tracking-[-0.01em] md:inline">{orgName}</span>
    </Link>
  );
}

export const useHub = () => useContext(Ctx);

/** A record's name keyed by its path, so the chip can say "Clients › Hal Lindqvist". */
export interface HubName { href: string; label: string }

const isActive = (pathname: string, d: Destination) =>
  d.href === "/" ? pathname === "/" : [d.href, ...(d.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));

export function whereAmI(pathname: string, abilities: readonly string[], names: HubName[]): { icon: IconName; area: string; href: string; record?: string } {
  const record = names.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.label;
  const area = primaryNav(abilities).find((d) => isActive(pathname, d));
  if (area) return { icon: area.icon, area: area.label, href: area.href, record };
  const gear = gearGroups(abilities).flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  if (gear) return { icon: gear.icon, area: gear.label, href: gear.href };
  if (pathname === "/") return { icon: "home", area: "Home", href: "/" };
  if (pathname.startsWith("/messages")) return { icon: "chat", area: "Messages", href: "/messages" };
  if (pathname.startsWith("/me")) return { icon: "user", area: "My profile", href: "/me" };
  if (pathname.startsWith("/search")) return { icon: "search", area: "Search", href: "/search" };
  return { icon: "home", area: "EVVora", href: "/" };
}

/**
 * The "you are here" control, centred in the top strip (user's pick "A", Sept 20, 2026 — the
 * corner button was too small to notice). Two halves: a filled "‹ Team" that goes back to the
 * area's list, and the open record's name. On a list page it is one quiet pill naming the area.
 */
export function HereChip({ abilities, names }: { abilities: readonly string[]; names: HubName[] }) {
  const pathname = usePathname();
  const w = whereAmI(pathname, abilities, names);
  const back = Boolean(w.record) && pathname !== w.href;
  // On a main page the chip only named where you are, which the page itself already does, so it
  // is not drawn (user, Oct 16, 2026). On a record it is the way back, and stays.
  if (!back) return null;
  return (
    <div className="flex h-9 max-w-full items-center overflow-hidden rounded-full border border-line bg-card">
      <Link href={w.href} aria-label={`Back to ${w.area}`} title={`Back to ${w.area}`} className="flex h-full shrink-0 items-center gap-1.5 pl-2.5 pr-4 text-[14.5px] font-medium text-text-strong transition-colors hover:bg-hover">
        <Icon.chevronLeft size={18} /> {w.area}
      </Link>
      {/* The record's name is not repeated here (user, Sept 28, 2026): the banner below already carries it, and the chip's job on a record is the way back. */}
    </div>
  );
}

export function CornerHub({ abilities, counts }: { abilities: readonly string[]; counts: NavCounts }) {
  const { open, phone, setOpen } = useHub();
  const pathname = usePathname();
  const router = useRouter();
  const panel = useModulePanel();
  const items = primaryNav(abilities);
  const here = items.find((d) => isActive(pathname, d));

  // Spokes sit on a quarter circle from straight left (index 0) to straight up (last). The radius
  // is CSS, so the arc shrinks on a phone without any measuring: 300px, or less when the window is
  // small. (No state is set from an effect — the React Compiler lint fails the build on it.)
  const angle = (i: number) => (items.length > 1 ? (Math.PI / 2) * (i / (items.length - 1)) : Math.PI / 4);
  const arc = { "--hub-r": "clamp(170px, min(100vw - 150px, 100vh - 170px), 300px)" } as CSSProperties;

  // Each label sits on its own spoke's line, pushed out past the button by its own half-extent so
  // neighbours never touch. Width is estimated from the text (14px Geist, medium); the 34px base
  // gap absorbs the estimate's error.
  const labelOffset = (d: Destination, i: number) => {
    const t = angle(i);
    const w = 20 + d.label.length * 7.6, h = 30;
    const off = 34 + Math.abs(Math.cos(t)) * (w / 2) + Math.abs(Math.sin(t)) * (h / 2);
    return { x: -Math.cos(t) * off, y: -Math.sin(t) * off };
  };

  const go = (d: Destination) => {
    setOpen(false);
    // On a client or team record, that module's spoke lifts the roster over the record (the
    // Sept 13 behaviour) so switching person never bounces through the list. Phones, and every
    // other case, simply navigate.
    const m = pathname.match(/^\/(clients|staff)\/([^/]+)/);
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    if (m && m[2] !== "new" && wide) {
      if (d.href === "/clients" && m[1] === "clients") { panel.setOpen(panel.open === "clients" ? null : "clients"); return; }
      if (d.href === "/staff" && m[1] === "staff") { panel.setOpen(panel.open === "team" ? null : "team"); return; }
    }
    router.push(d.href);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); setOpen(!open); return; }
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= items.length && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); go(items[n - 1]); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go reads fresh state each render
  }, [open, items, setOpen]);

  const HubIcon = Icon[here?.icon ?? "home"];

  return (<>
    {/* A click anywhere outside the fan closes it. Invisible on purpose (user, Sept 21: no dimming —
        the page stays bright while the fan is open). */}
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => setOpen(false)}
      className={cx("fixed inset-0 z-30 cursor-default bg-transparent", open ? "" : "pointer-events-none", !phone && "max-md:hidden")}
    />

    <nav aria-label="Main" aria-hidden={!open} style={arc} className={phone ? undefined : "max-md:hidden"}>
      {items.map((d, i) => {
        const Ic = Icon[d.icon];
        const t = angle(i);
        const cx_ = (-Math.cos(t)).toFixed(4), sy = (-Math.sin(t)).toFixed(4);
        const on = d === here;
        const badge = d.badge ? counts[d.badge] : 0;
        const off = labelOffset(d, i);
        return (
          <button
            key={d.href}
            type="button"
            onClick={() => go(d)}
            tabIndex={open ? 0 : -1}
            aria-current={on ? "page" : undefined}
            aria-label={`${d.label}${badge > 0 ? `, ${badge} to review` : ""}`}
            className={cx(
              "fixed bottom-24 right-6 z-30 flex size-12 md:bottom-9 md:right-9 items-center justify-center rounded-full border shadow-[0_8px_20px_rgba(35,42,58,0.14)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
              on ? "border-transparent bg-brand text-white" : "border-line bg-card text-text-strong hover:bg-tab-hover",
              open ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            style={{ transform: open ? `translate(calc(${cx_} * var(--hub-r)), calc(${sy} * var(--hub-r))) scale(1)` : "translate(0, 0) scale(0.5)", transitionDelay: open ? `${i * 22}ms` : "0ms" }}
          >
            <Ic size={20} />
            {badge > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-card bg-danger px-1 text-[13px] font-semibold leading-none text-white">{badge}</span>
            )}
            <span
              aria-hidden
              className={cx("pointer-events-none absolute left-1/2 top-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-text-strong px-2.5 py-1.5 text-[14px] font-medium text-white transition-opacity duration-150", open ? "opacity-100 delay-200" : "opacity-0")}
              style={{ transform: `translate(calc(-50% + ${off.x.toFixed(1)}px), calc(-50% + ${off.y.toFixed(1)}px))` }}
            >
              {d.label}
            </span>
          </button>
        );
      })}
    </nav>

    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-label={open ? "Close navigation" : "Open navigation (⌘ .)"}
      title={open ? "Close" : "Go to… (⌘ .)"}
      className={cx("fixed bottom-7 right-7 z-30 hidden size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(0,152,192,0.4)] transition-[transform,background-color] duration-200 hover:bg-primary-hover md:flex", open && "scale-105")}
    >
      <span className={cx("absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200", open ? "rotate-90 opacity-0" : "rotate-0 opacity-100")}><HubIcon size={26} /></span>
      <span className={cx("absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200", open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0")}><Icon.plus size={26} className="rotate-45" /></span>
    </button>
  </>);
}

/**
 * The phone's navigation (Oct 18, 2026, from the reference): a floating white pill of tabs along
 * the bottom with the current one filled, and a round button beside it. Up to four areas fit; when
 * a role has more, the fourth slot becomes "More", which opens the same fan the corner hub draws on
 * desktop. The round button is Messages, with its unread count. Hidden from `md` up, where the
 * corner hub and the Messages pill take over.
 */
export function PhoneTabBar({ abilities, counts, unread }: { abilities: readonly string[]; counts: NavCounts; unread: number }) {
  const pathname = usePathname();
  const { phone: phoneOpen, setOpen } = useHub();
  const items = primaryNav(abilities);
  const shown = items.length > 4 ? items.slice(0, 3) : items;
  const more = items.length > 4;
  const moreOn = more && items.slice(3).some((d) => isActive(pathname, d));
  const tab = "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[13px] font-medium leading-none transition-colors";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden">
      <nav aria-label="Primary" className="pointer-events-auto flex h-16 min-w-0 flex-1 items-stretch gap-1 rounded-full border border-line bg-card p-1.5 shadow-[0_10px_30px_rgba(35,42,58,0.12)]">
        {shown.map((d) => {
          const Ic = Icon[d.icon];
          const on = isActive(pathname, d);
          const badge = d.badge ? counts[d.badge] : 0;
          return (
            <Link key={d.href} href={d.href} onClick={() => setOpen(false)} aria-current={on ? "page" : undefined} className={cx(tab, on ? "bg-brand/10 text-brand-ink" : "text-muted-foreground hover:text-text-strong")}>
              <Ic size={20} />
              <span className="max-w-full truncate">{d.label.replace(/^My (.)/, (_m, c: string) => c.toUpperCase())}</span>
              {badge > 0 && <span className="absolute right-[18%] top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[13px] font-semibold leading-none text-white">{badge}</span>}
            </Link>
          );
        })}
        {more && (
          <button type="button" onClick={() => setOpen(!phoneOpen, true)} aria-expanded={phoneOpen} className={cx(tab, phoneOpen || moreOn ? "bg-primary-soft text-text-strong" : "text-muted-foreground hover:text-text-strong")}>
            <Icon.grid size={20} />
            <span>More</span>
          </button>
        )}
      </nav>
      <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"} className={cx("pointer-events-auto relative grid size-16 shrink-0 place-items-center rounded-full border border-line shadow-[0_10px_30px_rgba(35,42,58,0.12)]", pathname.startsWith("/messages") ? "bg-primary text-primary-foreground" : "bg-card text-text-strong")}>
        <Icon.chat size={22} />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-danger px-1 text-[13px] font-semibold leading-none text-white">{unread > 99 ? "99+" : unread}</span>}
      </Link>
    </div>
  );
}
