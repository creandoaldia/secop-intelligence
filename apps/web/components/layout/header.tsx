"use client";

import { useState } from "react";
import { Menu, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Sidebar } from "./sidebar";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    plan?: string | null;
    image?: string | null;
  };
}

const planBadge: Record<string, string> = {
  free: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  basic: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  pro: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  premium:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
};

export function Header({ user }: HeaderProps) {
  const initial = (user.name?.[0] ?? user.email?.[0] ?? "U").toUpperCase();
  const badgeClass = planBadge[user.plan ?? "free"] ?? planBadge.free;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-6">
      {/* Mobile: hamburger with sheet */}
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden -ml-2"
            />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar">
          <SheetHeader className="flex h-14 flex-row items-center gap-2 border-b border-sidebar-border px-6">
            <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
              <div className="size-2 rounded-full bg-primary" />
              <span className="font-heading text-sm font-semibold">
                SECOP Hub
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col py-4">
            <span />
          </div>
        </SheetContent>
      </Sheet>

      {/* Title */}
      <div className="flex-1" />

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="relative flex items-center gap-2 rounded-full"
            />
          }
        >
          <div className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user.name ?? "Usuario"}</span>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                badgeClass
              )}
            >
              {user.plan ?? "free"}
            </span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => signOut({ callbackUrl: "/login" })}
            variant="destructive"
            className="cursor-pointer"
          >
            <LogOut className="mr-2 size-4" />
            Cerrar sesion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
