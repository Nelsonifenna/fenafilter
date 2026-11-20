"use client";

import type { SessionInfo } from "@/lib/client/api";
import { Alert } from "./ui/primitives";

/** Tells the user (or developer) which integrations still need API keys. Never shows secrets. */
export function ServiceNotice({ services }: { services: SessionInfo["services"] | null }) {
  if (!services) return null;
  const missing: string[] = [];
  if (!services.gemini.configured) missing.push("fixture reading and instruction understanding (GEMINI_API_KEY)");
  if (!services.football.configured) missing.push("football statistics (API_FOOTBALL_KEY)");
  if (missing.length === 0) return null;
  return (
    <Alert tone="warn" title="Some services are not configured yet">
      This installation is missing {missing.join(", ")}. {services.gemini.configured ? "You can start an analysis, but some steps will not run." : "Analyses cannot start until fixture reading is configured."} See the README for setup steps.
    </Alert>
  );
}
