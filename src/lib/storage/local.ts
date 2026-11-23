import { promises as fs } from "node:fs";
import path from "node:path";
import { assertSafeKey, type ListedObject, type ObjectStore, type StoredObject } from "./types";

const EXT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};

/**
 * Development-only storage in a git-ignored folder (default ./.data).
 * Not usable on Vercel (the filesystem there is read-only/ephemeral).
 */
/**
 * On Windows, renaming onto a file that another write is replacing at the same moment
 * fails briefly with EPERM/EBUSY/EACCES. Retry a few times; the last write wins, as on Linux.
 */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 8 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? "")) {
        await fs.rm(from, { force: true }).catch(() => {});
        throw e;
      }
      await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
    }
  }
}

export class LocalObjectStore implements ObjectStore {
  readonly mode = "local" as const;
  constructor(private readonly root: string) {}

  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const rootAbs = path.resolve(this.root);
    if (!full.startsWith(rootAbs + path.sep)) throw new Error("Unsafe storage key");
    return full;
  }

  async put(key: string, body: Buffer | string, contentType: string) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write to a temp file then rename, so readers never see half-written JSON.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, body);
    await renameWithRetry(tmp, file);
    void contentType;
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.resolve(key);
    try {
      const body = await fs.readFile(file);
      return { body, contentType: EXT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      await fs.rm(this.resolve(key), { force: true });
    }
  }

  async list(prefix: string): Promise<ListedObject[]> {
    const rootAbs = path.resolve(this.root);
    const out: ListedObject[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(full);
        else if (!ent.name.endsWith(".tmp")) {
          const key = path.relative(rootAbs, full).split(path.sep).join("/");
          if (key.startsWith(prefix)) {
            const st = await fs.stat(full);
            out.push({ key, uploadedAt: st.mtime, size: st.size });
          }
        }
      }
    };
    // Start from the deepest existing directory of the prefix.
    const dirPart = prefix.includes("/") ? prefix.slice(0, prefix.lastIndexOf("/")) : "";
    await walk(path.join(rootAbs, dirPart));
    return out;
  }
}
