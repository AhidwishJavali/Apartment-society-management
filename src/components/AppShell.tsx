"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Role } from "@/lib/rules";
import { api } from "@/lib/client";
import { SessionProvider, useSession } from "./session";
import { Button, ToastProvider } from "./ui";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "RESIDENT", "MAINTENANCE", "SECURITY"] },
  { href: "/apartments", label: "Apartments", roles: ["ADMIN", "RESIDENT"] },
  { href: "/residents", label: "Residents", roles: ["ADMIN", "RESIDENT"] },
  { href: "/staff", label: "Staff", roles: ["ADMIN"] },
  { href: "/payments", label: "Payments", roles: ["ADMIN", "RESIDENT"] },
  { href: "/parking", label: "Parking", roles: ["ADMIN", "RESIDENT"] },
  { href: "/vehicles", label: "Vehicles", roles: ["ADMIN", "RESIDENT"] },
  { href: "/complaints", label: "Complaints", roles: ["ADMIN", "RESIDENT", "MAINTENANCE"] },
  { href: "/visitors", label: "Visitors", roles: ["ADMIN", "SECURITY"] },
  { href: "/notices", label: "Notices", roles: ["ADMIN", "RESIDENT", "MAINTENANCE", "SECURITY"] },
  { href: "/feedback", label: "Feedback", roles: ["ADMIN", "RESIDENT"] },
  { href: "/accounts", label: "Accounts", roles: ["ADMIN"] },
];

function Shell({ children }: { children: ReactNode }) {
  const user = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => n.roles.includes(user.role));

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className={`${open ? "block" : "hidden"} border-r border-slate-200 bg-white md:block md:w-56 md:shrink-0`}>
        <div className="px-4 py-4 text-lg font-semibold text-brand-700">Society Manager</div>
        <nav aria-label="Main" className="space-y-0.5 px-2 pb-4">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={pathname.startsWith(n.href) ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm ${pathname.startsWith(n.href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button type="button" className="rounded p-1 md:hidden" aria-label="Toggle navigation" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-600">
              {user.displayName} · <span className="font-medium">{user.role.toLowerCase()}</span>
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider>
        <Shell>{children}</Shell>
      </SessionProvider>
    </ToastProvider>
  );
}
