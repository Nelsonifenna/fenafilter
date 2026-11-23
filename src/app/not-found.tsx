import { PitchLines } from "@/components/brand/PitchLines";
import { AppNav } from "@/components/layout/AppNav";
import { ButtonLink, Kicker } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <AppNav variant="marketing" />
      <main className="relative flex-1 overflow-hidden">
        <PitchLines className="absolute -right-[10%] top-0 hidden h-full opacity-60 md:block" />
        <div className="frame relative grid gap-8 py-24 sm:py-32 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Kicker>Error 404</Kicker>
            <h1 className="mt-5 font-display text-hero font-bold uppercase">
              Out of <span className="text-accent">play.</span>
            </h1>
            <p className="mt-6 max-w-md text-muted">This page does not exist, or the analysis has expired. Analyses are deleted automatically after 24 hours.</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href="/dashboard">Back to the workspace</ButtonLink>
              <ButtonLink href="/history" variant="ghost">View history</ButtonLink>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
