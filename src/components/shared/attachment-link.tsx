import Link from "next/link";
import { Paperclip } from "lucide-react";

interface AttachmentLinkProps {
  label: string;
  /** The related FileAsset's storageKey — never a FileAsset id or a raw
   * filesystem path. The storage route (/api/files/[...key]) resolves
   * this through the storage abstraction and requires a signed-in
   * session; nothing here is a publicly guessable or directly
   * filesystem-mapped URL. */
  storageKey: string | null | undefined;
  emptyText?: string;
}

/** Standard "view attachment" link used everywhere a vehicle
 * image/meter-photo/site-photo/receipt might be attached. Renders a
 * muted placeholder when nothing was attached rather than nothing at all,
 * so it's clear the absence is real and not a rendering gap. */
export function AttachmentLink({ label, storageKey, emptyText = "None attached" }: AttachmentLinkProps) {
  if (!storageKey) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <Link
      href={`/api/files/${storageKey}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <Paperclip className="size-3.5" /> {label}
    </Link>
  );
}
