import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

// Where uploaded image BYTES live. The database (MediaAsset) only stores a
// `storageKey` pointing here.
//
// Today there is one driver: local disk. Later we can add an S3 / Cloudflare R2
// driver that implements the same `MediaStorage` interface (put/get/delete),
// and nothing else in the app has to change. The driver name is saved as a
// prefix on MediaAsset.storageKey ("local:<key>") so old files keep working
// even after the default driver changes.

export type StoredObject = {
  /** The file contents as a web stream (what a Route Handler Response wants). */
  body: ReadableStream<Uint8Array>;
  size: number;
};

export interface MediaStorage {
  /** Short name saved in front of every storageKey, e.g. "local". */
  readonly driver: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** null when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Removing something that is already gone is NOT an error. */
  delete(key: string): Promise<void>;
}

// Keys look like "<workspaceId>/<assetId>.<ext>". We build them ourselves, but
// we still refuse anything else so a bug can never become "write ../../x".
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(png|jpg|gif|webp)$/;

export function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid media storage key.");
}

/** Builds the key for a new file. Every workspace gets its own folder. */
export function buildStorageKey(workspaceId: string, assetId: string, ext: string): string {
  const key = `${workspaceId}/${assetId}.${ext}`;
  assertSafeKey(key);
  return key;
}

/** Stores files under <project>/storage/uploads (or MEDIA_STORAGE_DIR). */
class LocalDiskStorage implements MediaStorage {
  readonly driver = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /**
   * Turns a key into a full path and double-checks the result is INSIDE the
   * storage folder. This is the path-traversal guard: even if a weird key got
   * past the pattern check, it could not reach files outside our folder.
   */
  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    const relative = path.relative(this.root, full);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Media path escapes the storage folder.");
    }
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    // "wx" = fail if the file already exists, so we never overwrite an upload.
    await writeFile(full, bytes, { flag: "wx" });
  }

  async get(key: string): Promise<StoredObject | null> {
    const full = this.resolve(key);
    try {
      const info = await stat(full);
      if (!info.isFile()) return null;
      const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
      return { body, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    // `force: true` = no error if the file is already gone.
    await rm(this.resolve(key), { force: true });
  }
}

const STORAGE_DIR = process.env.MEDIA_STORAGE_DIR || path.join(process.cwd(), "storage", "uploads");

/** The storage the app uses for NEW uploads. */
export const mediaStorage: MediaStorage = new LocalDiskStorage(STORAGE_DIR);

// All drivers we can READ from, by name (add "s3" here later).
const drivers: Record<string, MediaStorage> = { [mediaStorage.driver]: mediaStorage };

/** "local:ws/id.png" → the driver plus the bare key. Throws for unknown drivers. */
export function parseStorageKey(storageKey: string): { storage: MediaStorage; key: string } {
  const colon = storageKey.indexOf(":");
  const storage = colon > 0 ? drivers[storageKey.slice(0, colon)] : undefined;
  if (!storage) throw new Error("Unknown media storage driver.");
  return { storage, key: storageKey.slice(colon + 1) };
}

/** What we save in MediaAsset.storageKey: "<driver>:<key>". */
export function toStorageKey(key: string): string {
  return `${mediaStorage.driver}:${key}`;
}
