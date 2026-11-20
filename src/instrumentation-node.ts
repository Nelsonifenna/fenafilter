/**
 * Startup configuration check (Node.js runtime only).
 * A production server with a missing or too-short SESSION_SECRET refuses to
 * start instead of failing later on the first request.
 * Only variable names are ever printed, never values.
 */
export async function validateConfigAtStartup() {
  if (process.env.NEXT_PHASE === "phase-production-build") return; // building, not serving
  const { getEnv } = await import("./lib/config/env");
  try {
    getEnv();
  } catch (e) {
    console.error(`[fenafilter] Configuration error: ${(e as Error).message}`);
    if (process.env.NODE_ENV === "production") process.exit(1);
    throw e;
  }
}
