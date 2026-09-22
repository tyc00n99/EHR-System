"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ComponentProps, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The app's own dropdown for every form (Sept 22, 2026, user: "I don't like the gray box"). A
 * native <select> hands its list to the operating system, which on a dark-mode Mac draws a dark
 * grey sheet that matches nothing on the page. This takes exactly the props and <option> children
 * a <select> takes, so the kit's `Select` can render it with no change at the call sites: the
 * value still submits under `name` (a real <select> sits invisibly under the button, so `required`
 * and FormData behave as before), and `onChange` still receives an event whose `target.value` is
 * the choice. Long lists (more than eight) get a search box.
 */
interface Opt { value: string; label: string; disabled?: boolean }

const cx = (...p: (string | false | null | undefined)[]) => p.filter(Boolean).join(" ");

function text(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(text).join("");
  if (isValidElement(n)) return text((n.props as { children?: ReactNode }).children);
  return "";
}

function collect(children: ReactNode, out: Opt[]) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string };
    if (c.type === "option") out.push({ value: p.value != null ? String(p.value) : text(p.children), label: p.label ?? text(p.children), disabled: p.disabled });
    else if (p.children) collect(p.children, out);
  });
}

export function SelectMenu({ className, children, value, defaultValue, onChange, name, required, disabled, id, "aria-label": ariaLabel, ...rest }: ComponentProps<"select">) {
  const options = useMemo(() => { const o: Opt[] = []; collect(children, o); return o; }, [children]);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(() => (defaultValue != null ? String(defaultValue) : (options[0]?.value ?? "")));
  const current = controlled ? String(value ?? "") : inner;
  const [open, setOpen] = useState(false);
  const sel = useRef<HTMLSelectElement>(null);
  // Where the popup's first focus lands: the search box, or the chosen row. Left to the library it
  // would focus the first row a beat after opening, pulling the list to the top mid-typing.
  const panelId = useId();
  const initialFocus = () => { const root = document.getElementById(panelId); return root?.querySelector<HTMLElement>("input") ?? root?.querySelector<HTMLElement>("[data-current]") ?? root ?? undefined; };
  const label = options.find((o) => o.value === current)?.label ?? "";

  const pick = (v: string) => {
    if (!controlled) setInner(v);
    if (sel.current) sel.current.value = v;
    // A frozen target: handlers like `(ev) => setState((f) => ({ ...f, k: ev.target.value }))` read the
    // value later, inside React's updater, by which time a controlled <select> has been reset.
    const target = { value: v, name: name ?? "" } as unknown as HTMLSelectElement;
    onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  return (
    <span className="relative block min-w-0">
      {/* The real control, invisible under the button: it carries name, value and required for the form. */}
      <select ref={sel} name={name} value={current} onChange={(e) => { if (!controlled) setInner(e.target.value); onChange?.(e); }} required={required} disabled={disabled} tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-0" {...rest}>{children}</select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" id={id} disabled={disabled} aria-label={ariaLabel} className={cx("flex items-center gap-2 pr-3 text-left", className, open && "border-primary")} />}>
          <span className={cx("min-w-0 flex-1 truncate", current === "" && "text-hint")}>{label}</span>
          <ChevronDown size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" initialFocus={initialFocus} className="w-[var(--anchor-width)] min-w-56 gap-0 p-1">
          <Panel id={panelId} options={options} current={current} onPick={pick} />
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Mounted only while open, so its effect is the "on open" moment: focus, and scroll the choice into view. */
function Panel({ id, options, current, onPick }: { id: string; options: Opt[]; current: string; onPick: (v: string) => void }) {
  const searchable = options.length > 8;
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const [hi, setHi] = useState(() => Math.max(0, options.findIndex((o) => o.value === current)));
  const h = Math.min(hi, shown.length - 1);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest" }); }, []);
  useEffect(() => { list.current?.querySelector("[data-hi]")?.scrollIntoView({ block: "nearest" }); }, [h]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(Math.min(h + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const o = shown[h]; if (o && !o.disabled) onPick(o.value); }
  };

  return (
    <div id={id} onKeyDown={onKey}>
      {searchable && (
        <div className="relative mb-1">
          <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Search…" aria-label="Search the list" className="h-8 w-full rounded-md border border-line bg-page pl-8 pr-2 text-[14px] outline-none placeholder:text-hint focus:border-primary" />
        </div>
      )}
      <div ref={list} tabIndex={searchable ? -1 : 0} className="max-h-72 overflow-y-auto outline-none">
        {shown.length === 0 && <div className="px-2.5 py-2 text-[14px] text-muted-foreground">Nothing matches</div>}
        {shown.map((o, i) => (
          <button key={o.value + i} type="button" disabled={o.disabled} onClick={() => onPick(o.value)} onMouseEnter={() => setHi(i)} data-current={o.value === current || undefined} data-hi={i === h || undefined}
            className={cx("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] text-text disabled:opacity-40", i === h && "bg-tab-hover", o.value === current && "font-medium text-text-strong")}>
            {o.value === current ? <Check size={14} aria-hidden className="shrink-0 text-primary" /> : <span className="w-3.5 shrink-0" />}
            <span className="truncate">{o.label || " "}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
