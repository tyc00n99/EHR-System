import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Sidebar } from "@/components/sidebar";
import { Avatar } from "@/components/ui";
import { signOut, type CurrentUser } from "@/lib/auth";

async function logout() {
  "use server";
  await signOut();
  redirect("/login");
}

const ROLE_LABEL = { admin: "Administrator", supervisor: "Supervisor", dsp: "Direct support" } as const;

export function AppShell({ user, orgName, attention, children }: { user: CurrentUser; orgName: string; attention: number; children: ReactNode }) {
  const office = user.role === "admin" || user.role === "supervisor";
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} orgName={orgName} attention={attention} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-page px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-nav text-[12px] font-bold text-white">D</span></Link>
          {office && (
            <form action="/search" className="relative hidden w-full max-w-md md:block">
              <Icon.search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input name="q" placeholder="Search clients, staff, PMI, agreement…" className="h-9 w-full rounded-md border border-line bg-gray-100 pl-9 pr-3 text-[13px] placeholder:text-hint focus:border-blue-500 focus:bg-page focus:outline-none focus:ring-2 focus:ring-blue-300/50" />
            </form>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {user.staffId && (
              <Link href="/clock" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent hover:bg-accent-hover"><Icon.clock size={15} /><span className="hidden sm:inline">Clock in</span></Link>
            )}
            {office && (
              <details className="relative">
                <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover [&::-webkit-details-marker]:hidden"><Icon.plus size={15} /> New <Icon.chevronDown size={13} className="text-gray-400" /></summary>
                <Menu>
                  <MenuLink href="/clients/new" icon="clients">Client</MenuLink>
                  {user.role === "admin" && <MenuLink href="/staff/new" icon="staff">Staff member</MenuLink>}
                  <MenuLink href="/visits/new" icon="edit">Manual visit</MenuLink>
                  <MenuLink href="/sites/new" icon="sites">Site</MenuLink>
                </Menu>
              </details>
            )}
            {office && (
              <Link href="/attention" aria-label="Needs attention" className="relative flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-hover">
                <Icon.bell size={18} />
                {attention > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white">{attention}</span>}
              </Link>
            )}
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md pl-1 pr-2 hover:bg-hover [&::-webkit-details-marker]:hidden">
                <Avatar name={user.staffName ?? user.email} size={28} />
                <span className="hidden text-[13px] font-medium text-text-strong md:block">{user.staffName?.split(" ")[0] ?? user.email}</span>
                <Icon.chevronDown size={13} className="hidden text-gray-400 md:block" />
              </summary>
              <Menu>
                <div className="px-2.5 py-2"><div className="truncate text-[13px] font-medium text-text-strong">{user.staffName ?? user.email}</div><div className="truncate text-xs text-muted">{user.email} · {ROLE_LABEL[user.role]}</div></div>
                <div className="my-1 border-t border-line-soft" />
                <MenuLink href="/me" icon="user">My profile</MenuLink>
                <MenuLink href="/services" icon="catalog">245D service types</MenuLink>
                <div className="my-1 border-t border-line-soft" />
                <form action={logout}><button className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-hover"><Icon.logout size={15} className="text-gray-500" />Log out</button></form>
              </Menu>
            </details>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-8 md:py-6">{children}</main>
        <MobileNav role={user.role} />
      </div>
    </div>
  );
}

function Menu({ children }: { children: ReactNode }) {
  return <div className="absolute right-0 top-11 z-30 w-60 rounded-lg border border-line bg-card p-1.5 shadow-[var(--shadow-md)]">{children}</div>;
}

function MenuLink({ href, icon, children }: { href: string; icon: keyof typeof Icon; children: ReactNode }) {
  const Ic = Icon[icon];
  return <Link href={href} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text hover:bg-hover"><Ic size={15} className="text-gray-500" />{children}</Link>;
}

function MobileNav({ role }: { role: CurrentUser["role"] }) {
  const items: [string, string, keyof typeof Icon][] =
    role === "dsp"
      ? [["/", "Home", "home"], ["/clock", "Clock", "clock"], ["/visits", "Visits", "visits"], ["/me", "Me", "user"]]
      : [["/", "Home", "home"], ["/clients", "Clients", "clients"], ["/visits", "Visits", "visits"], ["/attention", "Alerts", "bell"]];
  return (
    <nav className="sticky bottom-0 z-20 flex border-t border-line bg-page md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map(([href, label, icon]) => { const Ic = Icon[icon]; return <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted hover:text-text-strong"><Ic size={20} />{label}</Link>; })}
    </nav>
  );
}
