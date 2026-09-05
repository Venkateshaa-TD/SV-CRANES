import "server-only";

import type { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local-provider";

export type { StorageProvider, UploadInput, UploadResult } from "./types";
export { FileValidationError, MAX_UPLOAD_SIZE_BYTES } from "./validate";

let cachedProvider: StorageProvider | undefined;

/**
 * Returns the active storage provider based on STORAGE_PROVIDER. Add an
 * S3-compatible branch here when moving off local disk — no caller needs to
 * change, since everything depends on the StorageProvider interface.
 */
export function getStorageProvider(): StorageProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.STORAGE_PROVIDER ?? "local";

  switch (providerName) {
    case "local":
      cachedProvider = new LocalStorageProvider();
      return cachedProvider;
    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${providerName}". Only "local" is implemented in this phase.`,
      );
  }
}
