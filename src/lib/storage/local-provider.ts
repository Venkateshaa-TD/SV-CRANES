import "server-only";

import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { StorageProvider, UploadInput, UploadResult } from "./types";
import { generateSafeFilename, validateUpload } from "./validate";

const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

/** Joins a storage key onto the upload root, refusing anything that would
 * escape it (defense in depth — storageKey is always server-generated, but
 * this makes path traversal structurally impossible even if that changes). */
function resolveSafePath(storageKey: string): string {
  const resolved = path.join(UPLOAD_ROOT, storageKey);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep) && resolved !== UPLOAD_ROOT) {
    throw new Error("Invalid storage key.");
  }
  return resolved;
}

/**
 * Local-disk storage for development only. Files are written under
 * `.uploads/` (gitignored) rather than `public/` so they are never served
 * as static assets directly — every read goes through the authenticated
 * `/api/files/[...key]` route handler instead. Not suitable for
 * production/multi-instance deployments — swap in an S3-compatible
 * StorageProvider there; callers never need to change since they only
 * depend on the StorageProvider interface.
 */
export class LocalStorageProvider implements StorageProvider {
  async upload(input: UploadInput): Promise<UploadResult> {
    validateUpload({ mimeType: input.mimeType, sizeBytes: input.sizeBytes, buffer: input.buffer });

    const safeCategory = input.category.replace(/[^a-z0-9-]/gi, "");
    const filename = generateSafeFilename(input.mimeType);
    const storageKey = path.posix.join(safeCategory, filename);

    const destination = resolveSafePath(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, input.buffer);

    return { storageProvider: "local", storageKey };
  }

  async getUrl(storageKey: string): Promise<string> {
    return `/api/files/${storageKey}`;
  }

  async delete(storageKey: string): Promise<void> {
    const target = resolveSafePath(storageKey);
    await rm(target, { force: true });
  }

  /** Used only by the authenticated file-serving route handler. */
  async readFile(storageKey: string): Promise<Buffer> {
    return readFile(resolveSafePath(storageKey));
  }
}
