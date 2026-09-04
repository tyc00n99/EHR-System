import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ChevronDown, CircleHelp, Clock, FileEdit, LogOut, Plus, Building2, User, Users, UserSquare2, FileText } from "lucide-react";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { TopbarCrumbs } from "@/components/topbar-crumbs";
import { Avatar, cx } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotePreview } from "@/components/note-preview";
import { Toaster } from "@/components/ui/sonner";
import { ThemeMenuItems } from "@/components/theme-switcher";
import { signOut, type CurrentUser } from "@/lib/auth";

async function logout() {
  "use server";
  await signOut();
  redirect("/login");
}

const ROLE_LABEL = { admin: "Admin", supervisor: "Supervisor", dsp: "Caregiver" } as const;

export function AppShell({ user, orgName, attention, palette, children }: { user: CurrentUser; orgName: string; attention: number; palette: PaletteEntry[]; children: ReactNode }) {
  const office = user.role === "admin" || user.role === "supervisor";
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} orgName={orgName} attention={attention} canClock={Boolean(user.staffId)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page px-4 md:px-5">
          <Link href="/" className="flex items-center gap-2 md:hidden"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">D</span></Link>
          <TopbarCrumbs orgName={orgName} roleLabel={ROLE_LABEL[user.role]} />
          <div className="mx-auto flex min-w-0 flex-1 justify-center px-2"><CommandPalette entries={palette} role={user.role} /></div>
          <div className="flex shrink-0 items-center gap-1.5">
            {office && (
              <Link href="/attention" className={cx("hidden h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium sm:flex", attention > 0 ? "border-warn/40 bg-warn-soft text-warn" : "border-line bg-card text-text-strong")}>
                <span className={cx("h-2 w-2 rounded-full", attention > 0 ? "bg-warn" : "bg-ok")} />
                {attention > 0 ? `${attention} to review` : "All OK"}
              </Link>
            )}
            {user.staffId && <Button size="sm" className="h-8 gap-1.5 rounded-md" nativeButton={false} render={<Link href="/clock" />}><Clock className="size-4" /><span className="hidden sm:inline">Clock in</span></Button>}
            {office && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 rounded-md" />}><Plus className="size-4" /> New <ChevronDown className="size-3.5 text-gray-400" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem render={<Link href="/clients/new" />}><Users className="size-4" /> Client</DropdownMenuItem>
                  {user.role === "admin" && <DropdownMenuItem render={<Link href="/staff/new" />}><UserSquare2 className="size-4" /> Staff member</DropdownMenuItem>}
                  <DropdownMenuItem render={<Link href="/visits/new" />}><FileEdit className="size-4" /> Manual note</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/sites/new" />}><Building2 className="size-4" /> Site</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="hidden h-8 w-8 sm:inline-flex" nativeButton={false} render={<Link href="/services" aria-label="245D service reference" />}><CircleHelp className="size-[17px] text-muted-foreground" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className="flex h-8 items-center gap-2 rounded-md pl-1 pr-1.5 hover:bg-hover" />}>
                <Avatar name={user.staffName ?? user.email} size={26} />
                <ChevronDown className="hidden size-3.5 text-gray-400 md:block" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel><div className="truncate text-[13px] font-medium text-text-strong">{user.staffName ?? user.email}</div><div className="truncate text-xs font-normal text-muted-foreground">{user.email} · {ROLE_LABEL[user.role]}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/me" />}><User className="size-4" /> My profile</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/services" />}><FileText className="size-4" /> 245D service types</DropdownMenuItem>
                <ThemeMenuItems />
                <DropdownMenuSeparator />
                <form action={logout}><DropdownMenuItem render={<button type="submit" className="w-full" />}><LogOut className="size-4" /> Log out</DropdownMenuItem></form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
        <MobileNav role={user.role} />
        <Suspense fallback={null}><NotePreview /></Suspense>
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </div>
  );
}

function MobileNav({ role }: { role: CurrentUser["role"] }) {
  const items: [string, string, typeof Clock][] = role === "dsp"
    ? [["/", "Home", Users], ["/clock", "Clock", Clock], ["/visits", "Notes", FileText], ["/me", "Me", User]]
    : [["/", "Home", Users], ["/clients", "Clients", Users], ["/visits", "Notes", FileText], ["/attention", "Alerts", CircleHelp]];
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-line bg-page md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map(([href, label, Ic]) => <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:text-text-strong"><Ic className="size-5" />{label}</Link>)}
    </nav>
  );
}
