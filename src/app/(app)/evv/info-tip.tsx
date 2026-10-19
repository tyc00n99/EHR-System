"use client";

import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A circled "i" beside a page title; hovering or focusing it shows the extra explanation. */
export function InfoTip({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        render={<button type="button" aria-label="More about this page" className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary" />}
      >
        <Info className="size-[18px]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-4 text-left">
        <p className="text-[13.5px] leading-5 text-text">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
