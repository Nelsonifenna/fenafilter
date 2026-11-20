import "server-only";
import { createHash } from "node:crypto";
import { getStore, keys } from "./storage";

/**
 * Two-level cache: in-memory (per server instance) + object storage (shared
 * across instances and restarts). Used for football API responses to protect
 * the API quota.
 */
type Entry = { value: unknown; expiresAt: number };
const memory = new Map<string, Entry>();
const MAX_MEMORY = 2000;

export function cacheKey(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 40);
}

export async function cached<T>(namespace: string, key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const full = `${namespace}:${key}`;
  const now = Date.now();
  const m = memory.get(full);
  if (m && m.expiresAt > now) return m.value as T;

  const store = getStore();
  const storageKey = keys.cache(namespace, key);
  try {
    const obj = await store.get(storageKey);
    if (obj) {
      const entry = JSON.parse(obj.body.toString("utf8")) as Entry;
      if (entry.expiresAt > now) {
        remember(full, entry);
        return entry.value as T;
      }
    }
  } catch {
    // Cache read failures must never break the request.
  }

  const value = await load();
  const entry: Entry = { value, expiresAt: now + ttlSeconds * 1000 };
  remember(full, entry);
  try {
    await store.put(storageKey, JSON.stringify(entry), "application/json", { ttlDays: Math.max(1, Math.ceil(ttlSeconds / 86400)) });
  } catch {
    /* ignore */
  }
  return value;
}

function remember(k: string, e: Entry) {
  if (memory.size >= MAX_MEMORY) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
  memory.set(k, e);
}
