import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/primitives";
import { AnalyzeClient } from "./AnalyzeClient";

export const metadata: Metadata = { title: "Analysis" };

export default function AnalyzePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[480px] w-full" />}>
      <AnalyzeClient />
    </Suspense>
  );
}
