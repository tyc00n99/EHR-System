import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LogOut, Settings, User, FileText } from "lucide-react";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { CornerHub, HereChip, HubProvider } from "@/components/corner-hub";
import { Icon } from "@/components/icons";
import { SectionNav } from "@/components/top-nav";
import { ModulePanelProvider } from "@/components/module-panel";
import { Avatar } from "@/components/kit";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotePreview } from "@/components/note-preview";
import { Toaster } from "@/components/ui/sonner";
import { ThemeMenuItems } from "@/components/theme-switcher";
import { gearGroups, type NavCounts } from "@/lib/nav";
import { loginRequired, signOut, type CurrentUser } from "@/lib/auth";

async function logout() {
  "use server";
  await signOut();
  redirect("/login");
}

const ROLE_LABEL = { admin: "Admin", supervisor: "Supervisor", dsp: "Caregiver" } as const;

/**
 * The shell (Sept 20, 2026): no sidebar. A slim strip on top carries the logo, the centred
 * "you are here" control (which is also the way back from a record), the setup menu and the
 * account; the section row sits under it; the corner hub in the bottom-right is the whole primary
 * navigation. The page gets every pixel of width.
 */
export function AppShell({ user, orgName, counts, palette, children }: { user: CurrentUser; orgName: string; counts: NavCounts; palette: PaletteEntry[]; children: ReactNode }) {
  const gear = gearGroups(user.role);
  const names = palette.map((p) => ({ href: p.href, label: p.label }));
  return (
    <ModulePanelProvider>
    <HubProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-page-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-page focus:p-3 focus:text-primary">Skip to content</a>

      <header className="relative flex h-[56px] shrink-0 items-center gap-3 border-b border-line-soft px-4 md:px-5">
        <Link href="/" aria-label={`${orgName} home`} title={orgName} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/evvora-tile.png" alt="" width={32} height={32} className="size-8 rounded-lg object-cover" />
        </Link>
        {/* Centred on desktop, where it is the first thing the eye lands on; inline beside the logo on phones. */}
        <div className="flex min-w-0 flex-1 items-center md:absolute md:left-1/2 md:top-1/2 md:max-w-[min(60vw,720px)] md:-translate-x-1/2 md:-translate-y-1/2">
          <Suspense fallback={null}><HereChip role={user.role} names={names} /></Suspense>
        </div>
        <div className="hidden min-w-0 flex-1 md:block" />

        {!loginRequired() && (
          <span title="This link opens without a password, so anyone who has it can read every record. Set REQUIRE_LOGIN=1 to turn the login back on." className="hidden items-center gap-2 text-[13px] text-warn sm:flex" aria-label="No password set on this deployment">
            <span className="flex size-2.5 rounded-full bg-warn" /> No password on this link
          </span>
        )}
        {gear.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<button aria-label="Agency setup and reports" title="Setup & reports" className="flex size-9 items-center justify-center rounded-lg text-text hover:bg-tab-hover hover:text-text-strong" />}><Settings className="size-[19px]" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {gear.map((g, i) => (
                <DropdownMenuGroup key={g.label}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[13px] font-medium uppercase tracking-[0.11em] text-hint">{g.label}</DropdownMenuLabel>
                  {g.items.map((it) => {
                    const Ic = Icon[it.icon];
                    return <DropdownMenuItem key={it.href} render={<Link href={it.href} />}><Ic size={16} /> {it.label}</DropdownMenuItem>;
                  })}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<button aria-label="Account and appearance" className="flex size-9 items-center justify-center rounded-full hover:bg-tab-hover" />}>
            <Avatar name={user.staffName ?? user.email} size={32} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuGroup><DropdownMenuLabel><div className="truncate text-[13px] font-medium text-text-strong">{user.staffName ?? user.email}</div><div className="truncate text-[13px] font-normal text-muted-foreground">{user.email} · {ROLE_LABEL[user.role]}</div></DropdownMenuLabel></DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/me" />}><User className="size-4" /> My profile</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/services" />}><FileText className="size-4" /> 245D service types</DropdownMenuItem>
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            {loginRequired()
              ? <form action={logout}><DropdownMenuItem render={<button type="submit" className="w-full" />}><LogOut className="size-4" /> Log out</DropdownMenuItem></form>
              : <DropdownMenuItem render={<Link href="/login" />}><LogOut className="size-4" /> Sign in as someone else</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ⌘K still works — the palette stays mounted, just not drawn. */}
      <div className="sr-only"><CommandPalette entries={palette} role={user.role} /></div>

      <Suspense fallback={null}><SectionNav role={user.role} counts={counts} /></Suspense>

      <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-5 md:px-8 md:pb-28 md:pt-6">
        {/* One gutter and one content width for every page: pages do not centre themselves. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col">{children}</div>
      </main>

      <CornerHub role={user.role} counts={counts} />
      <Suspense fallback={null}><NotePreview /></Suspense>
      <Toaster position="bottom-left" richColors closeButton />
    </div>
    </HubProvider>
    </ModulePanelProvider>
  );
}
