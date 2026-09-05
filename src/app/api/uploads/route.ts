import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/current-user";
import { getStorageProvider, FileValidationError } from "@/lib/storage";
import { prisma } from "@/lib/db/prisma";

/** Logical folders a client may upload into. Keeps the storage key
 * namespace predictable and prevents an arbitrary client-supplied path
 * component. */
const ALLOWED_CATEGORIES = new Set([
  "vehicle-images",
  "meter-photos",
  "site-photos",
  "fuel-receipts",
  "expense-receipts",
]);

/**
 * Authenticated upload endpoint backing every FileUpload field in the app.
 * Never trusts the client's filename for storage — the storage provider
 * generates a random safe filename — and re-validates MIME type/size
 * server-side regardless of what the browser reported.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const category = String(formData.get("category") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid upload category." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = getStorageProvider();
    const uploaded = await provider.upload({
      buffer,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: buffer.length,
      category,
    });

    const asset = await prisma.fileAsset.create({
      data: {
        storageProvider: uploaded.storageProvider,
        storageKey: uploaded.storageKey,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: buffer.length,
        uploadedById: user.id,
      },
    });

    const url = await provider.getUrl(uploaded.storageKey);
    return NextResponse.json({ id: asset.id, url });
  } catch (error) {
    if (error instanceof FileValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
