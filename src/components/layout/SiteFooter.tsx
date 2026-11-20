import Link from "next/link";
import { Logo } from "../brand/Logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-sm text-muted">
            AI-assisted filtering for football fixture screenshots. Statistics are historical and estimates are not guarantees of any outcome.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm" aria-label="Footer">
          <Link className="text-muted hover:text-fg" href="/dashboard">Dashboard</Link>
          <Link className="text-muted hover:text-fg" href="/#how-it-works">How it works</Link>
          <Link className="text-muted hover:text-fg" href="/history">History</Link>
          <Link className="text-muted hover:text-fg" href="/#faq">FAQ</Link>
          <Link className="text-muted hover:text-fg" href="/settings">Settings & privacy</Link>
        </nav>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-faint">
        © FenaFilter. Please gamble responsibly. 18+.
      </div>
    </footer>
  );
}
