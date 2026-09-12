"use client";

import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { removeClientPhoto, setClientPhoto } from "./photo-actions";
import type { ActionState } from "@/lib/validation";

/**
 * The client's avatar, and the control that sets it.
 *
 * The camera badge is a real file picker: choosing an image submits immediately, so there is no
 * separate save step to forget. Without a photo it falls back to initials, which is what most
 * records will show — a photo is optional and nobody should be nagged for one.
 */
export function ClientPhoto({
  personId, initials, name, src, manage, size = 44,
}: { personId: string; initials: string; name: string; src: string | null; manage: boolean; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [menu, setMenu] = useState(false);

  const [, submit, pending] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await setClientPhoto(p, fd);
    if (r.ok) toast.success(r.message ?? "Photo updated.");
    else if (r.error) toast.error(r.error);
    return r;
  }, {});

  const [, drop, dropping] = useActionState(async (p: ActionState, fd: FormData) => {
    const r = await removeClientPhoto(p, fd);
    if (r.ok) toast.success(r.message ?? "Photo removed.");
    else if (r.error) toast.error(r.error);
    setMenu(false);
    return r;
  }, {});

  const busy = pending || dropping;

  return (
    <div className="relative shrink-0">
      <span
        className={cx("flex items-center justify-center overflow-hidden rounded-full bg-panel font-semibold text-text-strong", busy && "opacity-60")}
        style={{ width: size, height: size, fontSize: Math.round(size / 3.1) }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from an auth-gated route, not optimisable
          <img src={src} alt={`Photo of ${name}`} width={size} height={size} className="size-full object-cover" />
        ) : (
          initials
        )}
      </span>

      {manage && (
        <>
          <form ref={form} action={submit} className="hidden">
            <input type="hidden" name="personId" value={personId} />
            <input
              ref={input}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              onChange={() => { if (input.current?.files?.length) form.current?.requestSubmit(); }}
            />
          </form>

          <button
            type="button"
            disabled={busy}
            onClick={() => (src ? setMenu((v) => !v) : input.current?.click())}
            aria-label={src ? `Change or remove the photo of ${name}` : `Add a photo of ${name}`}
            className="absolute -bottom-1 -right-1 flex size-[22px] items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <Icon.camera size={12} />
          </button>

          {menu && (
            <>
              <button type="button" aria-label="Close" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(false)} />
              <div className="absolute left-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-card py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setMenu(false); input.current?.click(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-text hover:bg-hover"
                >
                  <Icon.camera size={15} /> Replace photo
                </button>
                <form action={drop}>
                  <input type="hidden" name="personId" value={personId} />
                  <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-danger hover:bg-danger-soft">
                    <Icon.trash size={15} /> Remove photo
                  </button>
                </form>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
