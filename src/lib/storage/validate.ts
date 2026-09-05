import { randomUUID } from "crypto";

/** Allowlist only — anything not listed here (including executables,
 * scripts, and archives) is rejected. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Used by the file-serving route to set Content-Type from a stored
 * filename's extension, since the local provider is keyed by path alone. */
export const MIME_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export class FileValidationError extends Error {}

/**
 * Checks the file's actual leading bytes against what its MIME type
 * claims, so a renamed/relabeled executable or script can't ride through
 * on a spoofed Content-Type — the browser-reported `file.type` (or a
 * hand-crafted multipart request bypassing the browser entirely) is never
 * trusted on its own. Each allowed type has a well-known magic number;
 * anything that doesn't match is rejected regardless of what MIME type it
 * claimed to be.
 */
function matchesFileSignature(buffer: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      );
    case "image/heic":
      // ISOBMFF container: a 4-byte box size followed by "ftyp". HEIC brand
      // codes vary (heic/heix/mif1/msf1/...) — checking for the "ftyp" box
      // itself is a reasonable, low-maintenance signature check without
      // hardcoding every brand variant.
      return buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp";
    case "application/pdf":
      return buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF";
    default:
      return false;
  }
}

export function validateUpload(input: {
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}): void {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new FileValidationError(
      `Unsupported file type "${input.mimeType}". Allowed: photo (JPEG/PNG/WEBP/HEIC) or PDF.`,
    );
  }
  if (input.sizeBytes <= 0) {
    throw new FileValidationError("File is empty.");
  }
  if (input.sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    throw new FileValidationError(
      `File exceeds the ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB limit.`,
    );
  }
  if (!matchesFileSignature(input.buffer, input.mimeType)) {
    throw new FileValidationError(
      "This file's contents don't match its reported type. Please upload a genuine photo or PDF.",
    );
  }
}

/**
 * Generates a random, collision-safe filename with the correct extension
 * for the validated MIME type. The client-supplied original filename is
 * never used to construct a storage path — only kept as display metadata.
 */
export function generateSafeFilename(mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType] ?? "bin";
  return `${randomUUID()}.${extension}`;
}
