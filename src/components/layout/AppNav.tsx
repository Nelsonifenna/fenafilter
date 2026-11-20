"use client";

import { History, LayoutDashboard, Menu, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "../brand/Logo";
import { ButtonLink, cn } from "../ui/primitives";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Top navigation for both marketing and app pages. */
export function AppNav({ variant = "app" }: { variant?: "app" | "marketing" }) {
  const [open, setOpen] = useState(false);
  const marketing = variant === "marketing";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur supports-[backdrop-filter]:bg-ink/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {marketing ? (
            <>
              <a href="#how-it-works" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">How it works</a>
              <a href="#features" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">Features</a>
              <a href="#examples" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">Examples</a>
              <a href="#faq" className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">FAQ</a>
            </>
          ) : (
            <Suspense fallback={<AppLinks path="" />}>
              <ActiveAppLinks />
            </Suspense>
          )}
        </nav>
        <div className="hidden md:block">
          {marketing ? <ButtonLink href="/dashboard" size="sm">Start analysing</ButtonLink> : <ButtonLink href="/dashboard" size="sm" variant="secondary">New analysis</ButtonLink>}
        </div>
        <button className="grid size-10 place-items-center rounded-lg text-muted hover:bg-surface-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-line bg-ink px-4 py-3 md:hidden" aria-label="Mobile">
          {(marketing ? [{ href: "/#how-it-works", label: "How it works" }, { href: "/#features", label: "Features" }, { href: "/#faq", label: "FAQ" }, ...LINKS] : LINKS).map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              {l.label}
            </Link>
          ))}
          <ButtonLink href="/dashboard" className="mt-2 w-full" onClick={() => setOpen(false)}>Start analysing</ButtonLink>
        </nav>
      )}
    </header>
  );
}

/** Reads the current URL, so it renders inside <Suspense> (Cache Components requirement). */
function ActiveAppLinks() {
  return <AppLinks path={usePathname()} />;
}

function AppLinks({ path }: { path: string }) {
  return LINKS.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors", path.startsWith(href) ? "bg-surface-2 text-fg" : "text-muted hover:text-fg")}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  ));
}
