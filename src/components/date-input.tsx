"use client";

import { CalendarDays } from "lucide-react";
import { useId, useState } from "react";
import { Month } from "@/components/filter-pill";
import { Input, cx } from "@/components/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A date field of our own (Sept 22, 2026, user's request): a text box that takes a typed date and
 * a calendar button that opens one month, the same calendar the Notes range picker uses. No OS
 * picker anywhere. The value the form sees is ISO (yyyy-mm-dd) in a hidden input under `name`,
 * exactly what `<input type="date">` submitted, so every action and schema stays as it was.
 * `onChange` receives `{ target: { value, name } }`, so existing `(e) => set(e.target.value)`
 * handlers work unchanged.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const chicagoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const show = (iso: string) => (ISO.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : iso);

/** Reads M/D/YYYY, MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD or 8 digits (MMDDYYYY); null when it is not a real date. */
export function parseTypedDate(text: string): string | null {
  const t = text.trim();
  if (!t) return "";
  let y: number, m: number, d: number;
  let hit: RegExpMatchArray | null;
  if ((hit = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
  else if ((hit = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { m = +hit[1]; d = +hit[2]; y = hit[3].length === 2 ? 2000 + +hit[3] : +hit[3]; }
  else if ((hit = t.match(/^(\d{2})(\d{2})(\d{4})$/))) { m = +hit[1]; d = +hit[2]; y = +hit[3]; }
  else return null;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(Date.UTC(y, m - 1, d));
  return check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? iso : null;
}

export interface DateInputProps {
  name?: string;
  /** ISO yyyy-mm-dd. Controlled when given. */
  value?: string;
  defaultValue?: string;
  onChange?(e: { target: { value: string; name?: string } }): void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

export function DateInput({ name, value, defaultValue, onChange, required, disabled, min, max, id, className, placeholder = "MM/DD/YYYY", "aria-label": ariaLabel }: DateInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const iso = controlled ? value : inner;
  const [text, setText] = useState<string | null>(null);   // what is being typed; null = show the value
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => (ISO.test(iso) ? iso : chicagoToday()).slice(0, 7));
  const autoId = useId();
  const inputId = id ?? autoId;

  const commit = (next: string) => {
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next, name } });
  };
  const finishTyping = () => {
    if (text === null) return;
    const parsed = parseTypedDate(text);
    if (parsed !== null) commit(parsed);
    setText(null);   // either committed, or reverted to the last good value
  };
  const inRange = (d: string) => (!min || d >= min) && (!max || d <= max);

  return (
    <div className={cx("relative", className)}>
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text ?? show(iso)}
        onChange={(e) => setText(e.target.value)}
        onBlur={finishTyping}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finishTyping(); } if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className="pr-10 tabular-nums"
      />
      {name && <input type="hidden" name={name} value={iso} />}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMonth((ISO.test(iso) ? iso : chicagoToday()).slice(0, 7)); }}>
        <PopoverTrigger render={<button type="button" disabled={disabled} aria-label="Open calendar" className={cx("absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-40", open && "bg-primary-soft text-primary")} />}>
          <CalendarDays className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto gap-0 p-3">
          <Month
            ym={month}
            from={iso}
            to={iso}
            today={chicagoToday()}
            onPick={(d) => { if (!inRange(d)) return; commit(d); setText(null); setOpen(false); }}
            onPrev={() => setMonth(shiftMonth(month, -1))}
            onNext={() => setMonth(shiftMonth(month, 1))}
          />
          <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2 text-[13px]">
            <button type="button" onClick={() => { const t = chicagoToday(); if (inRange(t)) { commit(t); setText(null); setOpen(false); } }} className="rounded-md px-2 py-1 font-medium text-primary hover:bg-tab-hover">Today</button>
            {iso && !required && <button type="button" onClick={() => { commit(""); setText(null); setOpen(false); }} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-tab-hover hover:text-text-strong">Clear</button>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
