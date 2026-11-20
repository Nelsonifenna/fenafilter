/**
 * Next.js startup hook — runs once when the server starts, before any request.
 * The Node.js-only checks live in a separate module so they are never bundled
 * for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateConfigAtStartup } = await import("./instrumentation-node");
    await validateConfigAtStartup();
  }
}
