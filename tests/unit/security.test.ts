import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { redact } from "@/lib/errors";
import { __resetRateLimits, checkRateLimit, LIMITS } from "@/lib/security/rate-limit";
import { signSessionId, verifySessionCookie } from "@/lib/security/session";
import { LocalObjectStore } from "@/lib/storage/local";

describe("session cookies", () => {
  const secret = "s".repeat(40);
  const sid = "0123456789abcdef0123456789abcdef";
  it("verifies valid and rejects tampered cookies", () => {
    const cookie = signSessionId(sid, secret);
    expect(verifySessionCookie(cookie, secret)).toBe(sid);
    expect(verifySessionCookie(cookie, "x".repeat(40))).toBeNull();
    expect(verifySessionCookie(cookie.replace(/.$/, (c) => (c === "a" ? "b" : "a")), secret)).toBeNull();
    expect(verifySessionCookie("../../etc.passwd", secret)).toBeNull();
    expect(verifySessionCookie(undefined, secret)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("blocks after the limit and resets after the window", () => {
    __resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < LIMITS.analyze.max; i++) checkRateLimit("analyze", "ip1", now);
    expect(() => checkRateLimit("analyze", "ip1", now)).toThrow(/Too many requests/);
    expect(() => checkRateLimit("analyze", "ip2", now)).not.toThrow();
    expect(() => checkRateLimit("analyze", "ip1", now + LIMITS.analyze.windowMs + 1)).not.toThrow();
  });
});

describe("secret redaction", () => {
  it("removes credentials from log lines", () => {
    const out = redact("failed with key=AIzaSyA1234567890abcdefghijklmnop and Authorization: Bearer abcdefghijkl12345 token vercel_blob_rw_ABC123xyz");
    expect(out).not.toMatch(/AIzaSy|abcdefghijkl12345|vercel_blob_rw_ABC/);
  });
});

describe("local storage", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ff-store-"));
  const store = new LocalObjectStore(dir);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips, lists by prefix and deletes", async () => {
    await store.put("jobs/abc/1.json", '{"a":1}', "application/json");
    await store.put("jobs/abc/2.json", '{"a":2}', "application/json");
    await store.put("jobs/other/3.json", "{}", "application/json");
    expect((await store.get("jobs/abc/1.json"))?.body.toString()).toBe('{"a":1}');
    expect((await store.list("jobs/abc/")).map((o) => o.key).sort()).toEqual(["jobs/abc/1.json", "jobs/abc/2.json"]);
    await store.delete("jobs/abc/1.json");
    expect(await store.get("jobs/abc/1.json")).toBeNull();
  });

  it("rejects path traversal", async () => {
    await expect(store.put("../evil.txt", "x", "text/plain")).rejects.toThrow(/Unsafe/);
    await expect(store.get("jobs/../../evil")).rejects.toThrow(/Unsafe/);
  });
});
