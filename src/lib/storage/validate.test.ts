import { describe, expect, it } from "vitest";
import { FileValidationError, MAX_UPLOAD_SIZE_BYTES, generateSafeFilename, validateUpload } from "./validate";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const PDF_BYTES = Buffer.from("%PDF-1.7\nrest of file", "ascii");
const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")]);
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // "MZ" (Windows PE header)

describe("validateUpload", () => {
  it("accepts an allowed image type within the size limit and matching signature", () => {
    expect(() => validateUpload({ mimeType: "image/jpeg", sizeBytes: JPEG_BYTES.length, buffer: JPEG_BYTES })).not.toThrow();
    expect(() => validateUpload({ mimeType: "image/png", sizeBytes: PNG_BYTES.length, buffer: PNG_BYTES })).not.toThrow();
    expect(() => validateUpload({ mimeType: "image/webp", sizeBytes: WEBP_BYTES.length, buffer: WEBP_BYTES })).not.toThrow();
    expect(() => validateUpload({ mimeType: "application/pdf", sizeBytes: PDF_BYTES.length, buffer: PDF_BYTES })).not.toThrow();
  });

  it("rejects a disallowed MIME type", () => {
    expect(() =>
      validateUpload({ mimeType: "application/x-msdownload", sizeBytes: EXE_BYTES.length, buffer: EXE_BYTES }),
    ).toThrow(FileValidationError);
  });

  it("rejects an empty file", () => {
    expect(() => validateUpload({ mimeType: "image/png", sizeBytes: 0, buffer: Buffer.alloc(0) })).toThrow(
      FileValidationError,
    );
  });

  it("rejects a file over the size limit", () => {
    expect(() =>
      validateUpload({ mimeType: "application/pdf", sizeBytes: MAX_UPLOAD_SIZE_BYTES + 1, buffer: PDF_BYTES }),
    ).toThrow(FileValidationError);
  });

  it("rejects MIME spoofing — an executable relabeled as an allowed image/pdf type", () => {
    // A renamed .exe claiming to be a JPEG must fail on its actual byte
    // signature, not be waved through on the claimed Content-Type alone.
    expect(() =>
      validateUpload({ mimeType: "image/jpeg", sizeBytes: EXE_BYTES.length, buffer: EXE_BYTES }),
    ).toThrow(FileValidationError);
    expect(() =>
      validateUpload({ mimeType: "application/pdf", sizeBytes: EXE_BYTES.length, buffer: EXE_BYTES }),
    ).toThrow(FileValidationError);
  });

  it("rejects a PDF's bytes mislabeled as an image", () => {
    expect(() =>
      validateUpload({ mimeType: "image/png", sizeBytes: PDF_BYTES.length, buffer: PDF_BYTES }),
    ).toThrow(FileValidationError);
  });
});

describe("generateSafeFilename", () => {
  it("produces a random filename with the extension matching the MIME type", () => {
    const filename = generateSafeFilename("application/pdf");
    expect(filename).toMatch(/^[0-9a-f-]{36}\.pdf$/);
  });

  it("never echoes back attacker-controlled input", () => {
    const filename = generateSafeFilename("image/jpeg");
    expect(filename).not.toContain("..");
    expect(filename).not.toContain("/");
  });
});
