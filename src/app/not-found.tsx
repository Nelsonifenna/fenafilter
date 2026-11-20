import { AppNav } from "@/components/layout/AppNav";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <AppNav variant="marketing" />
      <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted">This page does not exist, or the analysis has expired.</p>
        <ButtonLink href="/dashboard" className="mt-6">Go to dashboard</ButtonLink>
      </main>
    </>
  );
}
