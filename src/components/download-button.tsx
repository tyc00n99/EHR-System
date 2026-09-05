"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";

/**
 * A download that says it is working. A PDF of a whole pay period takes a few seconds to render,
 * and a plain link gives no sign the click landed, so this fetches the file and shows progress.
 */
export function DownloadButton({ href, children, variant = "primary", className, icon = "download" }: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
  icon?: "download" | "doc";
}) {
  const [busy, setBusy] = useState(false);
  const Ic = Icon[icon];

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "document.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("The document could not be built. Try again, or narrow the date range.");
    } finally {
      setBusy(false);
    }
  };

  const base = "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-btn)] px-4 text-[13px] font-medium whitespace-nowrap transition-colors disabled:opacity-60";
  const look = variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-line bg-page text-text hover:bg-hover";
  return (
    <button type="button" onClick={go} disabled={busy} aria-busy={busy} className={cx(base, look, className)}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Ic size={15} />}
      {busy ? "Preparing…" : children}
    </button>
  );
}
