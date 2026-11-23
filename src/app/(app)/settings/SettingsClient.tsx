"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Kicker, Notice } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/client/api";

/*
 * Privacy statements below are checked against the implementation:
 * - Images are stored privately and served only to the session that uploaded them.
 * - Analyses stop being available after 24 hours; their files carry a 1–2 day
 *   storage expiry and a daily cleanup removes anything older than 26 hours.
 * - "Clear history" deletes the analysis record, the screenshot and the edited image.
 * - Screenshots and instructions are processed by third-party AI and football-data
 *   services, so the copy says so without naming them.
 */
const PRIVACY = [
  { title: "Used for your analysis", text: "Your screenshot and instruction are used to read your fixtures and apply your rules. To do that, they are processed by our AI analysis partner, and team names are used to look up match statistics." },
  { title: "Private to you", text: "Screenshots and results are stored privately and can only be opened from the browser that created them. Nothing is ever shown publicly." },
  { title: "Removed automatically", text: "Analyses expire after 24 hours. Their screenshots and results are then deleted automatically, within about two days at most." },
  { title: "In your control", text: "Clear your history at any time. It deletes your screenshots, results and edited images straight away." },
];

export function SettingsClient() {
  const [count, setCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ tone: "accent" | "danger"; text: string } | null>(null);

  useEffect(() => {
    api.history().then((h) => setCount(h.items.length)).catch(() => setCount(null));
  }, []);

  async function clearHistory() {
    if (!window.confirm("Delete all analyses and images from this browser? This cannot be undone.")) return;
    setClearing(true);
    setMessage(null);
    try {
      const { items } = await api.history();
      for (const it of items) await api.deleteJob(it.id);
      setCount(0);
      setMessage({ tone: "accent", text: items.length ? `Deleted ${items.length} analys${items.length === 1 ? "is" : "es"} and their images.` : "There was nothing to delete." });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof ApiError ? e.message : "Your history could not be cleared. Please try again." });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-14">
      <header className="animate-rise grid gap-6 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <Kicker>Settings</Kicker>
          <h1 className="mt-3 font-display text-title font-bold uppercase">Privacy and data</h1>
        </div>
        <p className="max-w-sm text-sm text-muted lg:col-span-4 lg:col-start-9">How your screenshots are handled, and how to remove them.</p>
      </header>

      {/* Privacy */}
      <Block index="01" label="How it works" title="Privacy" intro="Short version: your screenshots are used for your analysis, kept private, and deleted automatically.">
        <dl className="grid gap-x-10 sm:grid-cols-2">
          {PRIVACY.map((p) => (
            <div key={p.title} className="border-t border-line py-5">
              <dt className="font-semibold">{p.title}</dt>
              <dd className="mt-1.5 text-sm text-muted">{p.text}</dd>
            </div>
          ))}
        </dl>
      </Block>

      {/* Your data */}
      <Block index="02" label="Manage" title="Your data" intro="Analyses are linked to this browser only. Clearing your browser’s cookies starts a fresh session.">
        <div className="border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div>
              <p className="font-display text-score font-bold leading-none tnum">{count === null ? "—" : String(count).padStart(2, "0")}</p>
              <p className="mt-2 text-sm text-muted">{count === 1 ? "analysis" : "analyses"} in this browser</p>
            </div>
            <Link href="/history" className="group inline-flex items-center gap-2 text-sm">
              <span className="link">View history</span>
              <ArrowRight className="size-4 text-faint transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
            </Link>
          </div>
          <div className="flex flex-col gap-4 border-t border-danger/40 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Clear history</p>
              <p className="mt-1 max-w-md text-sm text-muted">Deletes every analysis, screenshot and edited image from this browser. This cannot be undone.</p>
            </div>
            <Button variant="danger" onClick={clearHistory} loading={clearing} disabled={count === 0}>Clear all history</Button>
          </div>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      </Block>

      {/* Account */}
      <Block index="03" label="Profile" title="Account">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-line py-5">
          <div>
            <p className="font-semibold">Guest</p>
            <p className="mt-1 max-w-md text-sm text-muted">No sign-up needed. Accounts, to keep your history across devices, are on the way.</p>
          </div>
          <span className="font-mono text-[11px] text-faint">Coming soon</span>
        </div>
      </Block>

      {/* About */}
      <Block index="04" label="Product" title="About FenaFilter">
        <div className="max-w-prose space-y-3 border-t border-line pt-5 text-sm text-muted">
          <p>FenaFilter reads the fixtures in your screenshot, applies your rules using recent match statistics, and gives you back the same screenshot with only the fixtures you want.</p>
          <p>Statistics describe past matches and estimates are not guarantees. Nothing in FenaFilter is betting advice. 18+ · Please gamble responsibly.</p>
        </div>
      </Block>
    </div>
  );
}

/** Two-column block: title on the left, content on the right (stacks on mobile). */
function Block({ index, label, title, intro, children }: { index: string; label: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 lg:grid-cols-12" aria-labelledby={`settings-${index}`}>
      <div className="lg:col-span-4">
        <Kicker index={index}>{label}</Kicker>
        <h2 id={`settings-${index}`} className="mt-2 font-display text-section font-semibold uppercase">{title}</h2>
        {intro && <p className="mt-3 max-w-xs text-sm text-muted">{intro}</p>}
      </div>
      <div className="lg:col-span-8">{children}</div>
    </section>
  );
}
