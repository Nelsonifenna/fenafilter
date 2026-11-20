import "server-only";
import { del, get, list, put } from "@vercel/blob";
import { assertSafeKey, type ListedObject, type ObjectStore, type StoredObject } from "./types";

/**
 * Vercel Blob with PRIVATE access.
 *
 * Verified against the Vercel docs (Nov 2026): private stores return blobs only
 * through the authenticated `get()` SDK call; the blob URLs are not publicly
 * readable. Images reach the browser exclusively through our own
 * session-checked route (/api/image/...), never via a public URL.
 *
 * The store itself must be created as a *private* store in the Vercel dashboard
 * (access mode cannot be changed after creation).
 */
export class VercelBlobStore implements ObjectStore {
  readonly mode = "vercel-blob" as const;
  constructor(private readonly token: string) {}

  async put(key: string, body: Buffer | string, contentType: string, opts?: { ttlDays?: number }) {
    assertSafeKey(key);
    await put(key, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      cacheControlMaxAge: 60,
      ttlDays: opts?.ttlDays,
      token: this.token,
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key);
    const res = await get(key, { access: "private", useCache: false, token: this.token });
    if (!res || res.statusCode !== 200) return null;
    const body = Buffer.from(await new Response(res.stream).arrayBuffer());
    return { body, contentType: res.blob.contentType };
  }

  async delete(keys: string | string[]) {
    const arr = Array.isArray(keys) ? keys : [keys];
    if (arr.length === 0) return;
    arr.forEach(assertSafeKey);
    await del(arr, { token: this.token });
  }

  async list(prefix: string): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000, token: this.token });
      for (const b of page.blobs) out.push({ key: b.pathname, uploadedAt: new Date(b.uploadedAt), size: b.size });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  }
}
