"use client";

import type { SessionInfo } from "@/lib/client/api";
import { Notice } from "./ui/primitives";

/** Plain-language availability notice. Never names providers or configuration. */
export function ServiceNotice({ availability }: { availability: SessionInfo["availability"] | null }) {
  if (!availability) return null;
  if (!availability.analysis) {
    return (
      <Notice tone="warn" title="Analysis is temporarily unavailable">
        You can still prepare your screenshot and instruction, but analyses cannot start right now. Please try again later.
      </Notice>
    );
  }
  if (!availability.statistics) {
    return (
      <Notice tone="warn" title="Football statistics are temporarily unavailable">
        Rules about named clubs or competitions still work. Rules based on form, goals or probabilities will be marked for review.
      </Notice>
    );
  }
  return null;
}
