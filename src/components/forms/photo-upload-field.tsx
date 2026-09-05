"use client";

import * as React from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { FileUpload } from "./file-upload";
import { uploadFile } from "@/lib/upload-client";
import { toast } from "sonner";

interface PhotoUploadFieldProps {
  id: string;
  label: string;
  hint?: string;
  category: string;
  value: string | undefined;
  onChange: (fileAssetId: string | undefined) => void;
}

/**
 * Wraps FileUpload with the actual upload round-trip: picking a file
 * immediately uploads it and stores the resulting FileAsset id, so the
 * surrounding form only ever submits a plain id string — never a raw
 * File — through the server action boundary.
 */
export function PhotoUploadField({ id, label, hint, category, value, onChange }: PhotoUploadFieldProps) {
  const [uploading, setUploading] = React.useState(false);

  async function handleFileSelected(file: File | null) {
    if (!file) {
      onChange(undefined);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, category);
      onChange(uploaded.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      onChange(undefined);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <FileUpload id={id} label={label} hint={hint} onFileSelected={handleFileSelected} disabled={uploading} />
      {uploading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Uploading…
        </p>
      ) : value ? (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="size-3.5" /> Uploaded
        </p>
      ) : null}
    </div>
  );
}
