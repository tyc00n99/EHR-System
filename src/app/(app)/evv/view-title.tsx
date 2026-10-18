"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const VIEWS = [
  { value: "queue", label: "Review queue", hint: "Visits that need attention", href: "/evv" },
  { value: "compliance", label: "Compliance", hint: "Estimated compliance for a date range", href: "/evv?tab=compliance" },
];

/**
 * The EVV page's title is also how you move between its two screens: "EVV / Review queue ▾"
 * opens a menu with Compliance. It replaced a tab row that cost the page a whole band of height.
 */
export function EvvViewTitle({ current, meta }: { current: "queue" | "compliance"; meta?: React.ReactNode }) {
  const router = useRouter();
  const view = VIEWS.find((v) => v.value === current) ?? VIEWS[0];
  return (
    <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h1><DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" aria-label={`EVV: ${view.label}. Switch screen`} className="-ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-tab-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 data-[popup-open]:bg-tab-hover" />}>
          <span className="text-muted-foreground">EVV</span><span aria-hidden className="font-normal text-line">/</span><span>{view.label}</span>
          <ChevronDown size={20} aria-hidden className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-64">
          <DropdownMenuRadioGroup value={current} onValueChange={(v) => { const next = VIEWS.find((x) => x.value === v); if (next && next.value !== current) router.push(next.href); }}>
            {VIEWS.map((v) => (
              <DropdownMenuRadioItem key={v.value} value={v.value} className="flex-col items-start gap-0 py-2 pr-9 pl-2.5">
                <span className="text-[14px] font-medium text-text-strong">{v.label}</span>
                <span className="text-[13px] text-muted-foreground">{v.hint}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu></h1>
      {meta && <div className="text-[15px] text-muted-foreground">{meta}</div>}
    </header>
  );
}
