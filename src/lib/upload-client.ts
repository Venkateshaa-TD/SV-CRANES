"use client";

export interface UploadedFile {
  id: string;
  url: string;
}

/** Uploads through /api/uploads (see that route for server-side
 * validation). Used by every photo/receipt field. */
export async function uploadFile(file: File, category: string): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(body.error ?? "Upload failed. Please try again.");
  }
  return response.json();
}
