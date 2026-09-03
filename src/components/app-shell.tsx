import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, ChevronDown, Clock, FileEdit, LogOut, Plus, Building2, User, Users, UserSquare2, FileText } from "lucide-react";
import { CommandPalette, type PaletteEntry } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { Avatar } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/sonner";
import { ThemeMenuItems } from "@/components/theme-switcher";
import { signOut, type CurrentUser } from "@/lib/auth";

async function logout() {
  "use server";
  await signOut();
  redirect("/login");
}

const ROLE_LABEL = { admin: "Administrator", supervisor: "Supervisor", dsp: "Direct support" } as const;

export function AppShell({ user, orgName, attention, palette, children }: { user: CurrentUser; orgName: string; attention: number; palette: PaletteEntry[]; children: ReactNode }) {
  const office = user.role === "admin" || user.role === "supervisor";
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} orgName={orgName} attention={attention} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-nav text-[12px] font-bold text-white">D</span></Link>
          <CommandPalette entries={palette} role={user.role} />
          <div className="ml-auto flex items-center gap-1.5">
            {user.staffId && <Button size="sm" className="h-9 gap-1.5" nativeButton={false} render={<Link href="/clock" />}><Clock className="size-4" /><span className="hidden sm:inline">Clock in</span></Button>}
            {office && (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-9 gap-1" />}><Plus className="size-4" /> New <ChevronDown className="size-3.5 text-gray-400" /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem render={<Link href="/clients/new" />}><Users className="size-4" /> Client</DropdownMenuItem>
                  {user.role === "admin" && <DropdownMenuItem render={<Link href="/staff/new" />}><UserSquare2 className="size-4" /> Staff member</DropdownMenuItem>}
                  <DropdownMenuItem render={<Link href="/visits/new" />}><FileEdit className="size-4" /> Manual visit</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/sites/new" />}><Building2 className="size-4" /> Site</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {office && (
              <Button variant="ghost" size="icon" className="relative h-9 w-9" nativeButton={false} render={<Link href="/attention" aria-label="Needs attention" />}>
                <Bell className="size-[18px] text-gray-600" />
                {attention > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white">{attention}</span>}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<button className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-hover" />}>
                <Avatar name={user.staffName ?? user.email} size={28} />
                <span className="hidden text-[13px] font-medium text-text-strong md:block">{user.staffName?.split(" ")[0] ?? user.email}</span>
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
        <Toaster position="bottom-right" richColors closeButton />
      </div>
    </div>
  );
}

function MobileNav({ role }: { role: CurrentUser["role"] }) {
  const items: [string, string, typeof Clock][] = role === "dsp"
    ? [["/", "Home", Users], ["/clock", "Clock", Clock], ["/visits", "Visits", FileText], ["/me", "Me", User]]
    : [["/", "Home", Users], ["/clients", "Clients", Users], ["/visits", "Visits", FileText], ["/attention", "Alerts", Bell]];
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-line bg-page md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map(([href, label, Ic]) => <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:text-text-strong"><Ic className="size-5" />{label}</Link>)}
    </nav>
  );
}
