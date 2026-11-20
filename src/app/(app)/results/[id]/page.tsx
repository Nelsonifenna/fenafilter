import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { ResultsClient } from "./ResultsClient";

export const metadata: Metadata = { title: "Results" };

export default function ResultsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
      <ResultsClient />
    </Suspense>
  );
}
