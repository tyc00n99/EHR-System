"use client";

import { useState } from "react";
import { Check, Palette } from "lucide-react";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const THEMES = [
  { key: "hubble", label: "Hubble", hint: "Paper, ink, navy signal" },
  { key: "tide", label: "Tide", hint: "Light frame, teal" },
  { key: "slate", label: "Slate", hint: "Dark frame, indigo" },
  { key: "sage", label: "Sage", hint: "Cream, forest green" },
] as const;

export function ThemeMenuItems() {
  // The menu only mounts on the client after open, so reading the DOM in the initializer is safe.
  const [theme, setTheme] = useState(() => (typeof document === "undefined" ? "hubble" : document.documentElement.getAttribute("data-theme") || "hubble"));
  const pick = (t: string) => { document.documentElement.setAttribute("data-theme", t); try { localStorage.setItem("ehr.theme", t); } catch {} setTheme(t); };
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Palette className="size-3.5" /> Appearance</DropdownMenuLabel>
      {THEMES.map((t) => (
        <DropdownMenuItem key={t.key} onClick={() => pick(t.key)} closeOnClick={false}>
          <span className="flex-1"><span className="block">{t.label}</span><span className="block text-[11.5px] text-muted-foreground">{t.hint}</span></span>
          {theme === t.key && <Check className="size-4 text-primary" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/** Runs before hydration so the chosen theme paints on first frame. */
export const THEME_BOOT = `try{var t=localStorage.getItem("ehr.theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}`;
