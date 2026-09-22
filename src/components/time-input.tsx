"use client";

import { Clock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DateInput } from "@/components/date-input";
import { Input, cx } from "@/components/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A time field of our own (Sept 22, 2026, user: no OS controls): a text box that reads a typed time
 * and a clock button that opens a list in 15-minute steps, the unit everything here is billed in.
 * The value the form sees is `HH:MM` (24-hour) in a hidden input under `name`, exactly what
 * `<input type="time">` submitted, so no action or schema changed; `onChange` receives
 * `{ target: { value, name } }`, so `(e) => set(e.target.value)` handlers work unchanged.
 * ↑ and ↓ in the box nudge the time by one step.
 */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function showTime(hhmm: string): string {
  if (!HHMM.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Reads 9, 9a, 9am, 9:30, 9:30 pm, 930, 0930, 13:00, 1 pm, noon, midnight; null when it is not a time. */
export function parseTypedTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, "");
  if (!t) return "";
  if (t === "noon") return "12:00";
  if (t === "midnight") return "00:00";
  const hit = t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!hit) return null;
  let h = +hit[1];
  const m = hit[2] ? +hit[2] : 0;
  const ap = hit[3]?.[0];
  if (m > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; if (ap === "p" && h < 12) h += 12; if (ap === "a" && h === 12) h = 0; }
  else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fromMin = (n: number) => { const x = ((n % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

export interface TimeInputProps {
  name?: string;
  /** HH:MM, 24-hour. Controlled when given. */
  value?: string;
  defaultValue?: string;
  onChange?(e: { target: { value: string; name?: string } }): void;
  required?: boolean;
  disabled?: boolean;
  /** Minutes between entries in the list and per arrow-key nudge. */
  step?: number;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

export function TimeInput({ name, value, defaultValue, onChange, required, disabled, step = 15, id, className, placeholder = "9:00 AM", "aria-label": ariaLabel }: TimeInputProps) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const hhmm = controlled ? value : inner;
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const autoId = useId();
  // The popup's first focus goes to the current time, not the first row: the library would otherwise
  // focus "12:00 AM" a beat after opening and scroll the list back to the top.
  const nearRef = useRef<HTMLButtonElement>(null);

  const commit = (next: string) => {
    if (!controlled) setInner(next);
    onChange?.({ target: { value: next, name } });
  };
  const finishTyping = () => {
    if (text === null) return;
    const parsed = parseTypedTime(text);
    if (parsed !== null) commit(parsed);
    setText(null);
  };
  const nudge = (dir: 1 | -1) => {
    const base = HHMM.test(hhmm) ? toMin(hhmm) : 9 * 60;
    const snapped = dir > 0 ? Math.floor(base / step) * step + step : Math.ceil(base / step) * step - step;
    commit(fromMin(snapped));
    setText(null);
  };

  return (
    <div className={cx("relative", className)}>
      <Input
        id={id ?? autoId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text ?? showTime(hhmm)}
        onChange={(e) => setText(e.target.value)}
        onBlur={finishTyping}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); finishTyping(); }
          else if (e.key === "ArrowUp") { e.preventDefault(); nudge(1); }
          else if (e.key === "ArrowDown") { e.preventDefault(); nudge(-1); }
        }}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        className="pr-10 tabular-nums"
      />
      {name && <input type="hidden" name={name} value={hhmm} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<button type="button" disabled={disabled} aria-label="Choose a time" className={cx("absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-tab-hover hover:text-text-strong disabled:opacity-40", open && "bg-primary-soft text-primary")} />}>
          <Clock className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" initialFocus={nearRef} className="w-40 gap-0 p-1">
          <TimeList step={step} current={hhmm} nearRef={nearRef} onPick={(t) => { commit(t); setText(null); setOpen(false); }} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Mounted only while open: its effect scrolls the current (or nearest) time into view. */
function TimeList({ step, current, nearRef, onPick }: { step: number; current: string; nearRef: React.RefObject<HTMLButtonElement | null>; onPick: (t: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const times: string[] = [];
  for (let m = 0; m < 1440; m += step) times.push(fromMin(m));
  const near = HHMM.test(current) ? fromMin(Math.round(toMin(current) / step) * step) : "09:00";
  // The popup has no size on the frame it mounts (it is positioned a beat later), so retry on a
  // timer — not requestAnimationFrame, which never fires in a background tab.
  useEffect(() => {
    let timer = 0;
    const go = (tries: number) => {
      const el = list.current, hit = el?.querySelector<HTMLElement>("[data-near]");
      if (el && hit && el.clientHeight > 0) el.scrollTop = hit.offsetTop - el.clientHeight / 2 + hit.offsetHeight / 2;
      else if (tries > 0) timer = window.setTimeout(() => go(tries - 1), 16);
    };
    go(20);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div ref={list} className="relative max-h-64 overflow-y-auto">
      {times.map((t) => (
        <button key={t} ref={t === near ? nearRef : undefined} type="button" onClick={() => onPick(t)} data-near={t === near || undefined}
          className={cx("block w-full rounded-md px-2.5 py-1.5 text-left text-[14px] tabular-nums text-text hover:bg-tab-hover", t === current && "bg-primary-soft font-medium text-primary")}>
          {showTime(t)}
        </button>
      ))}
    </div>
  );
}

/**
 * Date and time together, submitting `YYYY-MM-DDTHH:MM` under `name`, exactly what
 * `<input type="datetime-local">` sent, so the actions that parse it are untouched.
 */
export function DateTimeInput({ name, defaultValue = "", required, disabled, className }: { name: string; defaultValue?: string; required?: boolean; disabled?: boolean; className?: string }) {
  const [d0, t0 = ""] = defaultValue.split("T");
  const [date, setDate] = useState(d0 ?? "");
  const [time, setTime] = useState(t0.slice(0, 5));
  return (
    <div className={cx("flex gap-2", className)}>
      <input type="hidden" name={name} value={date && time ? `${date}T${time}` : ""} />
      <DateInput value={date} onChange={(e) => setDate(e.target.value)} required={required} disabled={disabled} className="min-w-0 flex-1" aria-label="Date" />
      <TimeInput value={time} onChange={(e) => setTime(e.target.value)} required={required} disabled={disabled} className="w-[132px] shrink-0" aria-label="Time" />
    </div>
  );
}
