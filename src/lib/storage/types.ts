export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ListedObject {
  key: string;
  uploadedAt: Date;
  size: number;
}

/**
 * Minimal object-storage contract. Everything (uploads, job records, cached
 * football data, processed images) goes through this, so the provider can be
 * swapped (Vercel Blob, S3, Supabase Storage) without touching business logic.
 */
export interface ObjectStore {
  readonly mode: "vercel-blob" | "local";
  put(key: string, body: Buffer | string, contentType: string, opts?: { ttlDays?: number }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: string | string[]): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9/_.\-]{0,400}$/;

export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Unsafe storage key");
  }
}
