"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setWorkspace } from "@/app/workspace-actions";
import { cx } from "@/components/kit";
import { WORKSPACE_LABEL, type Workspace } from "@/lib/workspace";

/** Clinical | Practice Management. Saves the choice and re-renders the page in place. */
export function WorkspaceSwitch({ value, compact }: { value: Workspace; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (ws: Workspace) => { if (ws === value) return; start(async () => { await setWorkspace(ws); router.refresh(); }); };
  return (
    <div role="group" aria-label="Workspace" className={cx("inline-flex shrink-0 overflow-hidden rounded-lg border border-line bg-card", pending && "opacity-60")}>
      {(["clinical", "practice"] as Workspace[]).map((ws, i) => (
        <button key={ws} type="button" onClick={() => pick(ws)} aria-pressed={value === ws} disabled={pending} className={cx("h-8 whitespace-nowrap px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30", i > 0 && "border-l border-line", value === ws ? "text-primary shadow-[inset_0_-2px_0_var(--primary)]" : "text-text hover:bg-tab-hover")}>
          {compact && ws === "practice" ? "Practice Mgmt" : WORKSPACE_LABEL[ws]}
        </button>
      ))}
    </div>
  );
}

/** Under a tab row: what the other side holds, with a one-click switch. */
export function HiddenTabsHint({ labels, target }: { labels: string[]; target: Workspace }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (labels.length === 0) return null;
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return (
    <p className="-mt-3 mb-4 text-[13px] text-muted-foreground">
      {list} {labels.length === 1 ? "is" : "are"} in {WORKSPACE_LABEL[target]}. <button type="button" disabled={pending} onClick={() => start(async () => { await setWorkspace(target); router.refresh(); })} className="font-medium text-primary hover:underline">Switch</button>
    </p>
  );
}
