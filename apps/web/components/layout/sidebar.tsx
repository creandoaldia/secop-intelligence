"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileSearch,
  CalendarCheck,
  Bell,
  CreditCard,
  Users,
  Settings,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

interface SidebarProps {
  user: {
    name?: string | null;
    email?: string | null;
    plan?: string | null;
  };
}

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/procesos", label: "Procesos", icon: FileSearch },
  { href: "/pac", label: "PAC", icon: CalendarCheck },
  { href: "/alertas", label: "Alertas", icon: Bell },
  { href: "/planes", label: "Planes", icon: CreditCard },
  { href: "/sena", label: "SENA", icon: Users },
  { href: "/perfil", label: "Perfil", icon: Settings },
];

function NavContent({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {navLinks.map((link) => {
        const Icon = link.icon;
        const isActive =
          pathname === link.href ||
          (link.href !== "/" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarDesktop({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="size-2 rounded-full bg-primary" />
        <span className="font-heading text-sm font-semibold text-sidebar-foreground">
          SECOP Hub
        </span>
      </div>
      <div className="flex flex-1 flex-col py-4">
        <NavContent pathname={pathname} />
      </div>
    </aside>
  );
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <SidebarDesktop pathname={pathname} />

      {/* Mobile sheet */}
      <Sheet>
        <SheetTrigger className="lg:hidden">
          <span />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar">
          <SheetHeader className="flex h-14 flex-row items-center gap-2 border-b border-sidebar-border px-6">
            <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
              <div className="size-2 rounded-full bg-primary" />
              <span className="font-heading text-sm font-semibold">
                SECOP Hub
              </span>
            </SheetTitle>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-sidebar-foreground"
                />
              }
            >
              <XIcon className="size-4" />
            </SheetClose>
          </SheetHeader>
          <div className="flex flex-1 flex-col py-4">
            <NavContent pathname={pathname} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
