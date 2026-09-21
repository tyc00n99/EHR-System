"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { cx } from "@/components/kit";
import { useModulePanel } from "@/components/module-panel";
import { gearGroups, primaryNav, type Destination, type NavCounts, type Role } from "@/lib/nav";

/**
 * The corner hub (Sept 20, 2026, the user's pick over a sidebar): one round button in the
 * bottom-right corner is the whole primary navigation. Pressed — or ⌘ . — it fans the areas out in
 * a quarter circle with their names, and folds away when one is chosen (the digit keys still
 * choose a spoke, but the numbers are no longer drawn — user, Sept 20: redundant). The
 * button itself shows the icon of the area you are in, so it doubles as "where am I"; the control
 * centred in the strip says the same in words and, on a record, is the way back to the list.
 */

const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void; forget: () => void }>({ open: false, setOpen: () => {}, forget: () => {} });

/**
 * The fan is open by default on the home page (user, Sept 21: a greeting with nothing to click
 * is a dead end) and closed everywhere else. A choice the person makes is remembered for the
 * path it was made on, so a route change falls back to the default without an effect.
 */
export function HubProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<{ path: string; open: boolean } | null>(null);
  const open = choice && choice.path === pathname ? choice.open : pathname === "/";
  const setOpen = (v: boolean) => setChoice({ path: pathname, open: v });
  // Arriving at home again should open the fan again, so the home button forgets the last choice.
  const forget = () => setChoice(null);
  return <Ctx.Provider value={{ open, setOpen, forget }}>{children}</Ctx.Provider>;
}

/** The home button in the strip: a house on the soft tint, the agency's name beside it on desktop. */
export function HomeLink({ orgName }: { orgName: string }) {
  const { forget } = useHub();
  return (
    <Link href="/" aria-label={`${orgName} home`} title="Home" onClick={forget} className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-1.5 text-text-strong hover:bg-tab-hover">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary-soft text-primary"><Icon.home size={16} /></span>
      <span className="hidden text-[14.5px] font-medium md:inline">{orgName}</span>
    </Link>
  );
}

export const useHub = () => useContext(Ctx);

/** A record's name keyed by its path, so the chip can say "Clients › Hal Lindqvist". */
export interface HubName { href: string; label: string }

const isActive = (pathname: string, d: Destination) =>
  d.href === "/" ? pathname === "/" : [d.href, ...(d.also ?? [])].some((h) => pathname === h || pathname.startsWith(h + "/"));

export function whereAmI(pathname: string, role: Role, names: HubName[]): { icon: IconName; area: string; href: string; record?: string } {
  const record = names.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.label;
  const area = primaryNav(role).find((d) => isActive(pathname, d));
  if (area) return { icon: area.icon, area: area.label, href: area.href, record };
  const gear = gearGroups(role).flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  if (gear) return { icon: gear.icon, area: gear.label, href: gear.href };
  if (pathname === "/") return { icon: "home", area: "Home", href: "/" };
  if (pathname.startsWith("/me")) return { icon: "user", area: "My profile", href: "/me" };
  if (pathname.startsWith("/search")) return { icon: "search", area: "Search", href: "/search" };
  return { icon: "home", area: "EVVora", href: "/" };
}

/**
 * The "you are here" control, centred in the top strip (user's pick "A", Sept 20, 2026 — the
 * corner button was too small to notice). Two halves: a filled "‹ Team" that goes back to the
 * area's list, and the open record's name. On a list page it is one quiet pill naming the area.
 */
export function HereChip({ role, names }: { role: Role; names: HubName[] }) {
  const pathname = usePathname();
  const w = whereAmI(pathname, role, names);
  const Ic = Icon[w.icon];
  const back = Boolean(w.record) && pathname !== w.href;
  return (
    <div className="flex h-10 max-w-full items-center overflow-hidden rounded-full border border-line bg-card shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      {back ? (
        <Link href={w.href} aria-label={`Back to ${w.area}`} title={`Back to ${w.area}`} className="flex h-full shrink-0 items-center gap-1.5 bg-primary-soft pl-3 pr-4 text-[15px] font-semibold text-primary transition-[filter] hover:brightness-95">
          <Icon.chevronLeft size={18} /> {w.area}
        </Link>
      ) : (
        <Link href={w.href} aria-label={w.area} className="flex h-full shrink-0 items-center gap-2 pl-3.5 pr-4 text-[15px] font-medium text-text-strong hover:bg-tab-hover">
          <Ic size={16} className="text-primary" /> {w.area}
        </Link>
      )}
      {w.record && <span className="flex h-full min-w-0 items-center border-l border-line px-4 text-[15px] font-medium text-text-strong"><span className="truncate">{w.record}</span></span>}
    </div>
  );
}

export function CornerHub({ role, counts }: { role: Role; counts: NavCounts }) {
  const { open, setOpen } = useHub();
  const pathname = usePathname();
  const router = useRouter();
  const panel = useModulePanel();
  const items = primaryNav(role);
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
  const review = counts.review;

  return (<>
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => setOpen(false)}
      className={cx("fixed inset-0 z-30 cursor-default bg-slate-900/20 transition-opacity duration-200", open ? "opacity-100" : "pointer-events-none opacity-0")}
    />

    <nav aria-label="Main" aria-hidden={!open} style={arc}>
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
              "fixed bottom-9 right-9 z-30 flex size-12 items-center justify-center rounded-full border shadow-[0_8px_20px_rgba(15,23,42,0.14)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]",
              on ? "border-transparent bg-primary-soft text-primary" : "border-line bg-card text-text-strong hover:bg-tab-hover",
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
      className={cx("fixed bottom-7 right-7 z-30 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(0,152,192,0.4)] transition-[transform,background-color] duration-200 hover:bg-primary-hover", open && "scale-105")}
    >
      <span className={cx("absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200", open ? "rotate-90 opacity-0" : "rotate-0 opacity-100")}><HubIcon size={26} /></span>
      <span className={cx("absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-200", open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0")}><Icon.plus size={26} className="rotate-45" /></span>
      {!open && review > 0 && here?.badge !== "review" && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[13px] font-semibold leading-none text-white">{review}</span>
      )}
    </button>
  </>);
}
