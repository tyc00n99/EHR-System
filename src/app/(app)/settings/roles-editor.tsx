"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { MarginSection } from "@/components/chart";
import { Icon } from "@/components/icons";
import { Button, FormError, cx } from "@/components/kit";
import { ABILITIES, ROLE_LABELS, resolveAbilities, type Ability } from "@/lib/abilities";
import { saveRoleAbilities } from "./actions";

/**
 * Settings → Roles (Sept 28, 2026, user's request): what a Supervisor and a Direct support login
 * may do, one tick per ability. Administrator is shown for reference and cannot be changed — an
 * agency must never be able to lock itself out. One Save writes everything; it applies to every
 * login of that role at their next request.
 */
export function RolesEditor({ overrides }: { overrides: { role: string; ability: string; allowed: boolean }[] }) {
  const router = useRouter();
  const [grants, setGrants] = useState<{ supervisor: Ability[]; dsp: Ability[] }>(() => ({ supervisor: resolveAbilities("supervisor", overrides), dsp: resolveAbilities("dsp", overrides) }));
  const [state, submit, pending] = useActionState(saveRoleAbilities, {});
  useEffect(() => { if (state.ok) { toast.success(state.message ?? "Roles saved."); router.refresh(); } else if (state.message && !state.errors) toast.error(state.message); }, [state, router]);

  const toggle = (role: "supervisor" | "dsp", key: Ability) => setGrants((g) => ({ ...g, [role]: g[role].includes(key) ? g[role].filter((k) => k !== key) : [...g[role], key] }));
  const tick = (on: boolean, locked?: boolean) => (
    <span className={cx("inline-flex size-[22px] items-center justify-center rounded-md border-[1.5px]", on ? "border-text-strong bg-text-strong" : "border-line", locked && "opacity-60")}>{on && <Icon.check size={14} className="text-white" />}</span>
  );

  return (
    <form action={submit}>
      <input type="hidden" name="grants" value={JSON.stringify(grants)} />
      <MarginSection label="Roles" note={<span>Tick what each role may do. A change applies to every login with that role. Administrator can do everything and cannot be edited.</span>}>
        <FormError message={state.errors ? (state.message ?? "Check the list.") : undefined} />
        <div className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-x-4 pb-2 text-[12.5px] text-muted-foreground">
          <span>Ability</span>
          <span className="text-center">{ROLE_LABELS.admin}</span>
          <span className="text-center">{ROLE_LABELS.supervisor}</span>
          <span className="text-center">{ROLE_LABELS.dsp}</span>
        </div>
        {ABILITIES.map((a) => (
          <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_110px_110px_110px] items-center gap-x-4 border-t border-line-soft py-3">
            <div className="min-w-0">
              <div className="text-[15px] font-medium text-text-strong">{a.label}</div>
              <div className="text-[13px] leading-snug text-muted-foreground">{a.description}</div>
            </div>
            <div className="flex justify-center" title="Administrators can do everything">{tick(true, true)}</div>
            {(["supervisor", "dsp"] as const).map((role) => (
              <button key={role} type="button" onClick={() => toggle(role, a.key)} aria-pressed={grants[role].includes(a.key)} aria-label={`${ROLE_LABELS[role]}: ${a.label}`} className="flex justify-center rounded-md py-1 hover:bg-tab-hover">
                {tick(grants[role].includes(a.key))}
              </button>
            ))}
          </div>
        ))}
        <p className="pt-4 text-[13px] text-muted-foreground">Everyone with a caregiver record can clock in and write notes for their assigned clients; that is not a setting.</p>
      </MarginSection>
      <div className="flex gap-2 border-t border-line pt-5"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button><Button type="button" variant="ghost" onClick={() => router.refresh()}>Cancel</Button></div>
    </form>
  );
}
