import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LogOut, Settings, User, FileText } from "lucide-react";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { Icon } from "@/components/icons";
import { MobileNav } from "@/components/mobile-nav";
import { SectionNav } from "@/components/top-nav";
import { Sidebar } from "@/components/sidebar";
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

export function AppShell({ user, orgName, counts, palette, children }: { user: CurrentUser; orgName: string; counts: NavCounts; palette: PaletteEntry[]; children: ReactNode }) {
  const gear = gearGroups(user.role);
  return (
    <ModulePanelProvider>
    <div className="flex h-screen overflow-hidden bg-page-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-page focus:p-3 focus:text-primary">Skip to content</a>

      <Suspense fallback={<div className="hidden w-[240px] shrink-0 border-r border-line bg-sidebar md:block" />}>
      <Sidebar
        role={user.role}
        counts={counts}
        orgName={orgName}
        footer={<>
          {!loginRequired() && (
            <span title="This link opens without a password, so anyone who has it can read every record. Set REQUIRE_LOGIN=1 to turn the login back on." className="flex h-9 items-center gap-3 px-4 text-[13px] text-warn" aria-label="No password set on this deployment">
              <span className="flex size-2.5 rounded-full bg-warn" /> No password on this link
            </span>
          )}
          {gear.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<button aria-label="Agency setup and reports" className="flex h-10 w-full items-center gap-3 px-4 text-left text-[14.5px] text-text hover:bg-tab-hover hover:text-text-strong" />}><Settings className="size-[18px] shrink-0" /> Setup &amp; reports</DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-60">
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
            <DropdownMenuTrigger render={<button aria-label="Account and appearance" className="flex h-12 w-full items-center gap-3 px-4 text-left hover:bg-tab-hover" />}>
              <Avatar name={user.staffName ?? user.email} size={30} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-text-strong">{user.staffName ?? user.email}</span><span className="block truncate text-[12.5px] text-muted-foreground">{ROLE_LABEL[user.role]}</span></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-60">
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
        </>}
      />
      </Suspense>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* No top bar: the reference puts everything in the rail, so the record starts at the very
          top of the page. ⌘K still works — the palette stays mounted, just not drawn. */}
      <div className="sr-only"><CommandPalette entries={palette} role={user.role} /></div>

      <Suspense fallback={null}><SectionNav role={user.role} counts={counts} /></Suspense>

      <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-16 pt-5 md:px-8 md:pb-20 md:pt-6">
        {/* One gutter and one content width for every page: pages do not centre themselves. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col">{children}</div>
      </main>
      <MobileNav role={user.role} review={counts.review} />
      </div>
      <Suspense fallback={null}><NotePreview /></Suspense>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
    </ModulePanelProvider>
  );
}
