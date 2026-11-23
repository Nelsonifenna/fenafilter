import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { PitchLines } from "@/components/brand/PitchLines";
import { AppNav } from "@/components/layout/AppNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ButtonLink, Kicker, cn } from "@/components/ui/primitives";
import { EXAMPLE_INSTRUCTIONS } from "@/lib/examples";

const STEPS = [
  { title: "Upload", text: "A fixtures list, betting slip or bookmaker screenshot. PNG, JPG or WEBP up to 10 MB. Long scrolling captures are read in sections." },
  { title: "Instruct", text: "Write your rules in plain English. Combine conditions, add exceptions, name clubs or competitions. No fixed menus." },
  { title: "Verify", text: "Check every fixture the AI read and every threshold it assumed. Correct names, rows or rules before anything is analysed." },
  { title: "Export", text: "Rows you remove are cut out of the original image. Everything you keep stays exactly as it was, at full quality." },
];

const FEATURES = [
  { title: "Fixture reading", text: "FenaFilter reads team names, competitions, kick-off times and odds, and finds each fixture row on the image." },
  { title: "Rules in your words", text: "“High probability” becomes an explicit, editable threshold. Requests the data cannot support are listed, never guessed." },
  { title: "Real match data", text: "Recent finished results for every club: goals, home and away records, both teams scoring, clean sheets, failures to score and form." },
  { title: "Estimates you can read", text: "Chances of both teams scoring, over and under lines, and home, draw or away — always labelled separately from historical figures." },
  { title: "Your original image", text: "Nothing is redrawn. Unwanted rows are cut out and everything you keep stays exactly as it was." },
  { title: "Private by default", text: "Screenshots live in private storage, are visible only to your session, and are deleted automatically within a day." },
];

const STATES = [
  { state: "KEEP", label: "Keep", text: "The fixture does not meet your removal rule, or meets your keep rule. It stays in the image." },
  { state: "REMOVE", label: "Remove", text: "Sourced statistics satisfy your rule. The row is cut out, with the evidence listed next to it." },
  { state: "NEEDS_REVIEW", label: "Review", text: "Data is missing or a club is ambiguous. Nothing is removed until you decide." },
];

const FAQ = [
  { q: "Which screenshots work?", a: "Screenshots showing football fixtures as rows or cards — bookmaker apps, betting slips, fixture lists and results sites. Clear, uncropped captures work best. Very long screenshots are processed in sections." },
  { q: "Does FenaFilter predict results?", a: "No. It compares fixtures against your rules using historical match data and a transparent statistical model. Probabilities are estimates based on past results, not guarantees, and nothing here is betting advice." },
  { q: "What if the AI misreads a team name?", a: "Before any analysis you see every extracted fixture with its confidence. You can correct names, competitions and row boundaries, or mark a row as not a fixture." },
  { q: "What happens when statistics are missing?", a: "The fixture is marked for review with an explanation — for example, a club could not be identified or has too few recent matches. It stays in the image unless you remove it." },
  { q: "Is my image altered by AI?", a: "No. FenaFilter never redraws your screenshot. Unwanted rows are cut out, and everything you keep stays exactly as it was, at full quality." },
  { q: "Do I need an account?", a: "No. You can analyse screenshots as a guest. Analyses are linked to your browser session and expire automatically after 24 hours." },
];

/** Illustrative fixture sheet — fictional clubs, clearly labelled. */
function FixtureSpecimen() {
  const rows = [
    { home: "Northbridge", away: "Eastvale", comp: "League One", t: "15:00", p: 41, state: "KEEP" },
    { home: "Harbour City", away: "Kingsford", comp: "League One", t: "15:00", p: 72, state: "REMOVE" },
    { home: "Ashton Rovers", away: "Millbrook", comp: "League One", t: "17:30", p: 38, state: "KEEP" },
    { home: "Redcliffe", away: "Southport", comp: "Cup", t: "19:45", p: null, state: "NEEDS_REVIEW" },
    { home: "Westgate", away: "Lowfield", comp: "Cup", t: "20:00", p: 66, state: "REMOVE" },
  ] as const;
  return (
    <figure className="border border-line bg-surface">
      <figcaption className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="kicker">Illustration · fictional fixtures</span>
        <span className="font-mono text-[11px] text-muted">5 read</span>
      </figcaption>
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm text-fg/90">“Remove matches where both teams are likely to score.”</p>
        <p className="mt-1.5 font-mono text-[12px] text-accent">remove if both teams to score ≥ 60%</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="kicker text-left">
            <th className="py-2 pl-4 font-normal" scope="col">#</th>
            <th className="py-2 font-normal" scope="col">Fixture</th>
            <th className="hidden py-2 font-normal sm:table-cell" scope="col">Comp</th>
            <th className="py-2 pr-4 text-right font-normal" scope="col">Both score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.home} className="row-state border-t border-line" data-state={r.state}>
              <td className="py-2.5 pl-4 font-mono text-[12px] text-faint tnum">{String(i + 1).padStart(2, "0")}</td>
              <td className={cn("py-2.5 pr-2", r.state === "REMOVE" && "text-faint line-through decoration-danger/70")}>
                {r.home} <span className="text-faint">v</span> {r.away}
                <span className="ml-2 font-mono text-[11px] text-faint">{r.t}</span>
              </td>
              <td className="hidden py-2.5 font-mono text-[11px] text-muted sm:table-cell">{r.comp}</td>
              <td className="py-2.5 pr-4 text-right font-mono text-[12px] tnum">
                {r.p === null ? <span className="text-warn">review</span> : <span className={r.state === "REMOVE" ? "text-danger" : "text-fg"}>{r.p}%</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default function LandingPage() {
  return (
    <>
      <AppNav variant="marketing" />
      <main className="flex-1">
        {/* ------------------------------------------------------------ Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <PitchLines className="absolute -right-[12%] top-0 hidden h-[118%] opacity-70 lg:block" />
          <div className="frame relative grid gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-12 lg:gap-8 lg:pb-24">
            <div className="animate-rise lg:col-span-7">
              <Kicker>Football screenshot filtering</Kicker>
              <h1 className="mt-6 font-display text-hero font-bold uppercase tracking-[-0.01em]">
                <span className="block">Your Football Screenshots.</span>
                <span className="block text-muted">Your Rules.</span>
                <span className="block">
                  AI-Powered <span className="text-accent">Filtering.</span>
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-lg text-fg/80">
                Upload football fixtures, tell the AI what to remove, and receive a cleaner image backed by football statistics and analysis you can check.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <ButtonLink href="/dashboard" size="lg">
                  Start analysing <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <a href="#method" className="link text-[15px]">How it works</a>
              </div>
              <p className="mt-6 font-mono text-[12px] text-faint">No account needed · Private storage · Deleted after 24 hours</p>
            </div>
            <div className="animate-rise lg:col-span-5 lg:pt-16" style={{ animationDelay: "90ms" }}>
              <FixtureSpecimen />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Spec strip */}
        <section aria-label="Specifications" className="border-b border-line">
          <div className="frame">
          <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
            {[
              ["Formats", "PNG · JPG · WEBP"],
              ["Max size", "10 MB"],
              ["Kept for", "24 hours"],
              ["Download", "Full-quality PNG"],
            ].map(([k, v], i) => (
              <div key={k} className={cn("bg-ink py-5", i % 2 === 1 && "pl-4 md:pl-6", i === 2 && "md:pl-6")}>
                <dt className="kicker">{k}</dt>
                <dd className="mt-1.5 font-mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          </div>
        </section>

        {/* ------------------------------------------------------------ Method */}
        <section id="method" className="frame scroll-mt-20 py-20 sm:py-28">
          <div className="grid gap-6 lg:grid-cols-12">
            <h2 className="font-display text-title font-semibold uppercase lg:col-span-5">Four steps, two checkpoints</h2>
            <p className="max-w-lg text-muted lg:col-span-5 lg:col-start-8 lg:pt-2">
              You confirm what the AI read before statistics are fetched, and you confirm every decision before you download. Nothing is removed on the model’s say-so.
            </p>
          </div>
          <ol className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t border-line-strong pt-5">
                <span className="font-display text-score font-bold text-faint tnum">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
                {i >= 2 && <p className="mt-3 font-mono text-[11px] text-accent">Checkpoint {i - 1}</p>}
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------------- Decisions */}
        <section id="states" className="scroll-mt-20 border-y border-line bg-surface">
          <div className="frame grid gap-10 py-20 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Kicker>Three outcomes</Kicker>
              <h2 className="mt-4 font-display text-title font-semibold uppercase">Every row gets a verdict</h2>
              <p className="mt-4 max-w-sm text-sm text-muted">Decisions follow your rule applied to sourced data. Missing data never deletes a row.</p>
            </div>
            <ul className="lg:col-span-7 lg:col-start-6">
              {STATES.map((s) => (
                <li key={s.state} className="row-state grid gap-2 border-t border-line py-6 pl-6 last:border-b sm:grid-cols-[10rem_1fr] sm:gap-8" data-state={s.state}>
                  <span className="font-display text-2xl font-semibold uppercase">{s.label}</span>
                  <p className="text-sm text-fg/80">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- Features */}
        <section className="frame grid gap-12 py-20 sm:py-28 lg:grid-cols-12">
          <div className="lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
            <h2 className="font-display text-title font-semibold uppercase">Built for the fixture list</h2>
            <p className="mt-4 max-w-sm text-muted">Reading, rules, statistics and a clean export — designed around how fixture lists actually look.</p>
          </div>
          <dl className="lg:col-span-7 lg:col-start-6">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="grid gap-2 border-t border-line py-6 sm:grid-cols-[3rem_12rem_1fr] sm:gap-6">
                <span className="font-mono text-[12px] text-faint tnum">{String(i + 1).padStart(2, "0")}</span>
                <dt className="font-semibold">{f.title}</dt>
                <dd className="text-sm text-muted">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------------------------------------------------------- Examples */}
        <section id="examples" className="scroll-mt-20 border-t border-line">
          <div className="frame py-20 sm:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="font-display text-title font-semibold uppercase">Say it your way</h2>
              <p className="max-w-sm text-sm text-muted">Pick one to open the workspace with it filled in.</p>
            </div>
            <ul className="mt-10 border-b border-line">
              {EXAMPLE_INSTRUCTIONS.map((ex, i) => (
                <li key={ex}>
                  <Link
                    href={`/dashboard?instruction=${encodeURIComponent(ex)}`}
                    className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-4 border-t border-line py-4 transition-colors hover:bg-surface sm:grid-cols-[4rem_1fr_auto] sm:py-5"
                  >
                    <span className="font-mono text-[12px] text-faint tnum transition-colors group-hover:text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-[15px] text-fg/85 transition-colors group-hover:text-fg sm:text-lg">{ex}</span>
                    <ArrowRight className="size-4 text-faint transition-[color,transform] duration-200 group-hover:translate-x-1 group-hover:text-accent" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line">
          <div className="frame grid gap-10 py-20 sm:py-28 lg:grid-cols-12">
            <h2 className="font-display text-title font-semibold uppercase lg:col-span-4">Questions</h2>
            <div className="lg:col-span-7 lg:col-start-6">
              {FAQ.map((f) => (
                <details key={f.q} className="faq group border-t border-line last:border-b">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15px] font-medium transition-colors hover:text-accent">
                    {f.q}
                    <Plus className="faq-sign size-4 shrink-0 text-muted transition-transform duration-200" aria-hidden />
                  </summary>
                  <p className="max-w-2xl pb-6 text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- CTA */}
        <section className="border-t border-line bg-surface">
          <div className="frame grid items-end gap-8 py-16 lg:grid-cols-12">
            <p className="font-display text-title font-semibold uppercase lg:col-span-8">
              One screenshot in. <span className="text-muted">Only the fixtures you want out.</span>
            </p>
            <div className="lg:col-span-4 lg:text-right">
              <ButtonLink href="/dashboard" size="lg">
                Start analysing <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
