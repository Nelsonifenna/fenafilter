import Link from "next/link";
import { Logo } from "../brand/Logo";

const LINKS = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings and privacy" },
  { href: "/#method", label: "Method" },
  { href: "/#faq", label: "Questions" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="frame grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-muted">
            Filtering for football fixture screenshots. Statistics are historical; probabilities are model estimates, not predictions or betting advice.
          </p>
        </div>
        <nav className="md:col-span-4" aria-label="Footer">
          <p className="kicker">Index</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted transition-colors hover:text-fg">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="md:col-span-3">
          <p className="kicker">Privacy</p>
          <p className="mt-3 text-sm text-muted">Screenshots are private to your browser session and deleted automatically. You can clear your history at any time in Settings.</p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="frame flex flex-wrap items-center justify-between gap-3 py-4 font-mono text-[11px] text-faint">
          <span>© FenaFilter</span>
          <span>18+ · Please gamble responsibly</span>
        </div>
      </div>
    </footer>
  );
}
