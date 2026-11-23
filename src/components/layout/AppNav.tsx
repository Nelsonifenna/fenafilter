"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "../brand/Logo";
import { ButtonLink, cn } from "../ui/primitives";

const APP_LINKS = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
];
const SITE_LINKS = [
  { href: "/#method", label: "Method" },
  { href: "/#states", label: "Decisions" },
  { href: "/#examples", label: "Examples" },
  { href: "/#faq", label: "Questions" },
];

/** Top bar shared by marketing and app pages. */
export function AppNav({ variant = "app" }: { variant?: "app" | "marketing" }) {
  const [open, setOpen] = useState(false);
  const marketing = variant === "marketing";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-md">
      <div className="frame flex h-14 items-center gap-8">
        <Logo />
        <nav className="hidden h-full items-stretch md:flex" aria-label="Main">
          {marketing ? (
            SITE_LINKS.map((l) => <NavLink key={l.href} href={l.href} label={l.label} active={false} />)
          ) : (
            <Suspense fallback={<AppLinks path="" />}>
              <ActiveAppLinks />
            </Suspense>
          )}
        </nav>
        <div className="ml-auto hidden md:block">
          {marketing ? (
            <ButtonLink href="/dashboard" size="sm">Start analysing</ButtonLink>
          ) : (
            <ButtonLink href="/dashboard" size="sm" variant="secondary">New analysis</ButtonLink>
          )}
        </div>
        <button
          className="ml-auto grid size-10 place-items-center text-muted transition-colors hover:text-fg md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      <div id="mobile-nav" className="reveal md:hidden" data-open={open}>
        <div inert={!open}>
          <nav className="frame border-t border-line pb-4" aria-label="Mobile">
            {(marketing ? [...SITE_LINKS, ...APP_LINKS] : APP_LINKS).map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-line py-3.5 text-[15px] text-fg/90">
                {l.label}
                <span className="font-mono text-xs text-faint" aria-hidden>→</span>
              </Link>
            ))}
            <ButtonLink href="/dashboard" className="mt-4 w-full" onClick={() => setOpen(false)}>Start analysing</ButtonLink>
          </nav>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center px-3 text-[13px] transition-colors",
        "after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:origin-left after:bg-accent after:transition-transform after:duration-200",
        active ? "text-fg after:scale-x-100" : "text-muted after:scale-x-0 hover:text-fg hover:after:scale-x-100 hover:after:bg-line-strong",
      )}
    >
      {label}
    </Link>
  );
}

/** Reads the current URL, so it renders inside <Suspense> (Cache Components requirement). */
function ActiveAppLinks() {
  return <AppLinks path={usePathname()} />;
}

function AppLinks({ path }: { path: string }) {
  return APP_LINKS.map((l) => <NavLink key={l.href} href={l.href} label={l.label} active={path.startsWith(l.href)} />);
}
