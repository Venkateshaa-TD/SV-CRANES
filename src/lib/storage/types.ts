export interface UploadInput {
  /** Raw file bytes. */
  buffer: Buffer;
  /** Client-supplied filename — display only, never used to build a path. */
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Logical folder, e.g. "expense-receipts", "vehicle-documents". */
  category: string;
}

export interface UploadResult {
  storageProvider: string;
  /** Opaque key the provider needs to retrieve/delete the file later. Never
   * a client-controlled path. */
  storageKey: string;
}

/**
 * Storage abstraction so business/database code never talks to the
 * filesystem (or a cloud SDK) directly. Swapping the local dev provider for
 * an S3-compatible one later means implementing this interface only — no
 * changes to callers.
 */
export interface StorageProvider {
  upload(input: UploadInput): Promise<UploadResult>;
  /** Returns a URL the app can use to display/download the file. For a
   * private provider this may be a short-lived signed URL. */
  getUrl(storageKey: string): Promise<string>;
  delete(storageKey: string): Promise<void>;
}
