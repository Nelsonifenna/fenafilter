import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "../config/env";
import { AppError } from "../errors";

/**
 * Guest sessions.
 *
 * Every visitor gets an anonymous, HMAC-signed session cookie. All jobs,
 * uploads and images are namespaced by session id, and every API route checks
 * that the requested resource belongs to the caller's session. This is the
 * "request authentication" layer for the MVP.
 *
 * Upgrade path: when Supabase Auth is added, `getSession()` returns the
 * authenticated user id instead, and the rest of the app is unchanged because
 * it only ever sees an opaque `ownerId`.
 */
const COOKIE = "ff_sid";
const MAX_AGE_S = 60 * 60 * 24 * 30;
const SID_RE = /^[a-f0-9]{32}$/;

export function signSessionId(sid: string, secret: string) {
  const mac = createHmac("sha256", secret).update(sid).digest("hex").slice(0, 32);
  return `${sid}.${mac}`;
}

export function verifySessionCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const [sid, mac] = value.split(".");
  if (!sid || !mac || !SID_RE.test(sid)) return null;
  const expected = signSessionId(sid, secret).split(".")[1]!;
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return sid;
}

/** Returns the current session id, or null if the visitor has none. */
export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(COOKIE)?.value, getEnv().sessionSecret);
}

/** Returns the session id, creating a new session cookie if needed (route handlers only). */
export async function getOrCreateSessionId(): Promise<string> {
  const existing = await getSessionId();
  if (existing) return existing;
  const sid = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(COOKIE, signSessionId(sid, getEnv().sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().isProduction,
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return sid;
}

export async function requireSessionId(): Promise<string> {
  const sid = await getSessionId();
  if (!sid) throw new AppError("UNAUTHORIZED", "Your session has expired. Please start a new analysis.");
  return sid;
}
