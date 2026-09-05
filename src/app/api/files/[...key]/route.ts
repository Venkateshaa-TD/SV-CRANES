import { NextResponse, type NextRequest } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getStorageProvider } from "@/lib/storage";
import { MIME_BY_EXTENSION } from "@/lib/storage/validate";
import { LocalStorageProvider } from "@/lib/storage/local-provider";

interface RouteParams {
  params: Promise<{ key: string[] }>;
}

/**
 * Authenticated file download for the local storage provider. Uploads are
 * never placed under `public/`, so this route — which requires a signed-in
 * session before touching disk — is the only way to read them back. The
 * path segments come straight from server-generated storage keys (see
 * LocalStorageProvider.upload), never from arbitrary client input.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const user = await requireCurrentUser().catch(() => null);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const storageKey = key.join("/");

  const provider = getStorageProvider();
  if (!(provider instanceof LocalStorageProvider)) {
    return NextResponse.json({ error: "Unsupported storage provider" }, { status: 500 });
  }

  let buffer: Buffer;
  try {
    buffer = await provider.readFile(storageKey);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
