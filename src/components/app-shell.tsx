import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ChevronDown, Clock, FileEdit, LogOut, Plus, Settings, Building2, User, Users, UserSquare2, FileText } from "lucide-react";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { Icon } from "@/components/icons";
import { MobileNav } from "@/components/mobile-nav";
import { SectionNav } from "@/components/top-nav";
import { SideRail } from "@/components/side-rail";
import { Avatar } from "@/components/kit";
import { Button } from "@/components/ui/button";
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
  const office = user.role === "admin" || user.role === "supervisor";
  const gear = gearGroups(user.role);
  return (
    <div className="flex min-h-screen bg-page-bg">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-page focus:p-3 focus:text-primary">Skip to content</a>

      <SideRail
        role={user.role}
        counts={counts}
        orgName={orgName}
        footer={<>
          {gear.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<button aria-label="Agency setup and reports" className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-text-strong" />}><Settings className="size-[18px]" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-60">
                {gear.map((g, i) => (
                  <DropdownMenuGroup key={g.label}>
                    {i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10.5px] font-medium uppercase tracking-[0.11em] text-hint">{g.label}</DropdownMenuLabel>
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
            <DropdownMenuTrigger render={<button aria-label="Account and appearance" className="flex size-9 items-center justify-center rounded-md hover:bg-hover" />}>
              <Avatar name={user.staffName ?? user.email} size={26} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-60">
              <DropdownMenuGroup><DropdownMenuLabel><div className="truncate text-[13px] font-medium text-text-strong">{user.staffName ?? user.email}</div><div className="truncate text-xs font-normal text-muted-foreground">{user.email} · {ROLE_LABEL[user.role]}</div></DropdownMenuLabel></DropdownMenuGroup>
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

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page px-4 md:gap-4 md:px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 md:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[12px] font-medium text-primary-foreground">D</span>
        </Link>
        <span className="hidden max-w-[260px] truncate text-[14px] font-medium text-text-strong md:block">{orgName}</span>

        <div className="flex flex-1 justify-end" />

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden min-w-0 sm:block"><CommandPalette entries={palette} role={user.role} /></div>
          {user.staffId && <Button size="sm" className="h-8 gap-1.5 rounded-md" nativeButton={false} render={<Link href="/clock" />}><Clock className="size-4" /><span className="hidden sm:inline">Clock in</span></Button>}
          {office && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 rounded-md" />}><Plus className="size-4" /><span className="hidden lg:inline">New</span><ChevronDown className="size-3.5 text-gray-400" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem render={<Link href="/clients/new" />}><Users className="size-4" /> Client</DropdownMenuItem>
                {user.role === "admin" && <DropdownMenuItem render={<Link href="/staff/new" />}><UserSquare2 className="size-4" /> Staff member</DropdownMenuItem>}
                <DropdownMenuItem render={<Link href="/visits/new" />}><FileEdit className="size-4" /> Manual note</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/sites/new" />}><Building2 className="size-4" /> Site</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* An open deployment must never be mistaken for a locked one. */}
          {!loginRequired() && (
            <span title="This link opens without a password, so anyone who has it can read every record. Set REQUIRE_LOGIN=1 to turn the login back on." className="hidden h-8 items-center rounded-md border border-warn/40 bg-warn-soft px-2.5 text-[12px] font-medium text-warn lg:flex">
              No password
            </span>
          )}
        </div>
      </header>

      <Suspense fallback={null}><SectionNav role={user.role} counts={counts} /></Suspense>

      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
      <MobileNav role={user.role} review={counts.review} />
      </div>
      <Suspense fallback={null}><NotePreview /></Suspense>
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
