import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileImage,
  Layers,
  MessageSquareText,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { AppNav } from "@/components/layout/AppNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ButtonLink, Card } from "@/components/ui/primitives";
import { EXAMPLE_INSTRUCTIONS } from "@/lib/examples";

const STEPS = [
  { icon: Upload, title: "Upload a screenshot", text: "Drop in a fixtures or betting-slip screenshot from any app or website — PNG, JPG or WEBP." },
  { icon: MessageSquareText, title: "Describe your rules", text: "Write what to remove or keep in plain English. No fixed menus, no predefined markets." },
  { icon: ScanSearch, title: "Check what the AI read", text: "Review the fixtures and rules the AI extracted, and correct anything before it is analysed." },
  { icon: FileImage, title: "Download the clean image", text: "Unwanted rows are cut out of your original screenshot. Everything you keep stays pixel-perfect." },
];

const FEATURES = [
  { icon: Eye, title: "Computer-vision fixture reading", text: "Gemini reads team names, competitions, kick-off times and odds, and locates every fixture row." },
  { icon: Sparkles, title: "Natural-language rules", text: "Combine conditions with AND / OR, keep exceptions, named clubs and leagues. Vague wording is turned into explicit, editable thresholds." },
  { icon: BarChart3, title: "Real football statistics", text: "Recent results from API-Football: goals, home/away records, BTTS, clean sheets, failed-to-score and form." },
  { icon: Layers, title: "Transparent probability model", text: "Poisson estimates for BTTS, over/under and win probabilities, clearly separated from historical frequencies." },
  { icon: Wand2, title: "Original-pixel editing", text: "No AI redrawing. Rows are removed from your actual image and the rest is reassembled losslessly." },
  { icon: ShieldCheck, title: "Private by default", text: "Screenshots are stored privately, only visible in your session, and deleted automatically within a day." },
];

const BENEFITS = [
  "Every removal comes with the statistics and the rule that triggered it",
  "Missing or uncertain data is flagged for review, never silently removed",
  "Thresholds such as “high probability” are shown and editable",
  "Works with long scrolling captures and different screenshot layouts",
];

const FAQ = [
  {
    q: "Which screenshots work?",
    a: "Screenshots showing football fixtures as rows or cards — bookmaker apps, betting slips, fixture lists and results sites. Clear, uncropped captures work best. Very long screenshots are processed in sections.",
  },
  {
    q: "Does FenaFilter predict results?",
    a: "No. It compares fixtures against your rules using historical match data and a transparent statistical model. Probabilities are estimates based on past results, not guarantees, and nothing on this site is betting advice.",
  },
  {
    q: "What if the AI misreads a team name?",
    a: "Before any analysis, you see every extracted fixture with its confidence. You can correct names, competitions and row boundaries, or mark a row as not a fixture.",
  },
  {
    q: "What happens when statistics are missing?",
    a: "The fixture is marked “Needs review” with an explanation (for example, a club could not be identified or has too few recent matches). It is kept in the image unless you decide otherwise.",
  },
  {
    q: "Is my image altered by AI?",
    a: "No generative model touches your image. Rows are cut out of the original pixels with an image-processing library, and the output is saved as a lossless PNG.",
  },
  {
    q: "Do I need an account?",
    a: "No. You can analyse screenshots as a guest. Your analyses are linked to your browser session and expire automatically after 24 hours.",
  },
];

function PreviewMock() {
  const rows = [
    { h: "Northbridge", a: "Eastvale", keep: true, tag: "BTTS 41%" },
    { h: "Harbour City", a: "Kingsford", keep: false, tag: "BTTS 72%" },
    { h: "Ashton Rovers", a: "Millbrook", keep: true, tag: "BTTS 38%" },
    { h: "Redcliffe", a: "Southport Utd", keep: false, tag: "BTTS 66%" },
  ];
  return (
    <Card className="relative overflow-hidden p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-faint">Illustrative preview · fictional clubs</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-strong">4 fixtures read</span>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">
        <span className="text-fg">“Remove matches where both teams are likely to score.”</span>
        <div className="mt-2 font-mono text-[11px] text-accent-strong">Remove if BTTS probability ≥ 60%</div>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.h} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm ${r.keep ? "border-line bg-surface-2" : "border-danger/30 bg-danger-soft/60"}`}>
            <span className={`min-w-0 truncate ${r.keep ? "text-fg" : "text-fg/60 line-through decoration-danger/70"}`}>
              {r.h} <span className="text-faint">vs</span> {r.a}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-xs text-muted">{r.tag}</span>
              {r.keep ? <Check className="size-4 text-accent" aria-label="Keep" /> : <X className="size-4 text-danger" aria-label="Remove" />}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function LandingPage() {
  return (
    <>
      <AppNav variant="marketing" />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-pitch border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
                <Sparkles className="size-3.5" aria-hidden /> AI football screenshot filtering
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Your Football Screenshots. Your Rules. <span className="text-accent">AI-Powered Filtering.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted text-pretty">
                Upload football fixtures, tell our AI what to remove, and receive a cleaner image backed by football statistics and intelligent analysis.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/dashboard" size="lg">
                  Start analysing <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink href="#how-it-works" size="lg" variant="secondary">See how it works</ButtonLink>
              </div>
              <p className="mt-4 text-sm text-faint">No sign-up needed. Images are private and deleted automatically.</p>
            </div>
            <PreviewMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted">Four steps, with you in control at every checkpoint.</p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Card className="h-full p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent"><s.icon className="size-4.5" aria-hidden /></span>
                    <span className="font-mono text-xs text-faint">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{s.text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-line bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Built for football, not a generic chatbot</h2>
            <p className="mt-2 max-w-2xl text-muted">Vision, language understanding, statistics and image processing — each doing the job it is best at.</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl border border-line bg-surface p-5">
                  <f.icon className="size-5 text-accent" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Say it however you like</h2>
          <p className="mt-2 max-w-2xl text-muted">A few instructions to get you started. Click one to try it.</p>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {EXAMPLE_INSTRUCTIONS.map((ex) => (
              <Link
                key={ex}
                href={`/dashboard?instruction=${encodeURIComponent(ex)}`}
                className="group flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm text-fg/90 transition-colors hover:border-accent/40 hover:bg-surface-2"
              >
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span className="flex-1">“{ex}”</span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="border-y border-line bg-surface/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Decisions you can check</h2>
              <p className="mt-3 text-muted">
                FenaFilter never removes a fixture because an AI “has a feeling”. Every decision follows your rules, applied to sourced statistics, and you review the result before downloading.
              </p>
            </div>
            <ul className="space-y-3">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 text-center">
            <ButtonLink href="/dashboard" size="lg">
              Start analysing <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
