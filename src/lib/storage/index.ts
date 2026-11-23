import "server-only";
import { getEnv } from "../config/env";
import { AppError, USER_MESSAGES } from "../errors";
import { LocalObjectStore } from "./local";
import type { ObjectStore } from "./types";
import { VercelBlobStore } from "./vercel-blob";

let store: ObjectStore | null = null;

export function getStore(): ObjectStore {
  if (store) return store;
  const env = getEnv();
  if (env.blob.token) {
    store = new VercelBlobStore(env.blob.token);
  } else if (env.isVercel) {
    throw new AppError("SERVICE_NOT_CONFIGURED", USER_MESSAGES.uploadsUnavailable, {
      internal: "Storage not configured on Vercel: connect a private Blob store with BLOB_READ_WRITE_TOKEN",
    });
  } else {
    store = new LocalObjectStore(env.localStorageDir);
  }
  return store;
}

/** Storage key layout (all namespaced by owner so ownership checks are a prefix test). */
export const keys = {
  uploadPrefix: (owner: string) => `uploads/${owner}/`,
  job: (owner: string, jobId: string) => `jobs/${owner}/${jobId}.json`,
  jobPrefix: (owner: string) => `jobs/${owner}/`,
  output: (owner: string, jobId: string) => `outputs/${owner}/${jobId}.png`,
  cache: (namespace: string, hash: string) => `cache/${namespace}/${hash}.json`,
};

export function __setStoreForTests(s: ObjectStore | null) {
  store = s;
}
