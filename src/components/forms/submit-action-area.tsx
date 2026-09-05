import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubmitActionAreaProps {
  submitLabel: string;
  onCancel?: () => void;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Sticky form footer so the primary save action stays reachable with one
 * hand on a phone, even in a long form. The bottom offset below `md` is
 * deliberately NOT 0: the app's fixed BottomNav also occupies the bottom
 * of the viewport there (with a higher z-index than a plain sticky
 * element would have), so a naive `sticky bottom-0` footer parks itself
 * underneath the nav bar — an invisible, unreachable submit button. The
 * offset (~4.5rem + the same safe-area inset the nav pads itself with)
 * comfortably clears the nav's real rendered height, notch included, with
 * a little margin to spare. At `md` and up there is no bottom nav (the
 * sidebar takes over instead), so it reverts to flush `bottom-0`. Place
 * at the end of a <form>; the submit button relies on the surrounding
 * <form>'s onSubmit (type="submit"), keeping this a dumb layout component.
 */
export function SubmitActionArea({
  submitLabel,
  onCancel,
  cancelLabel = "Cancel",
  loading,
  disabled,
  className,
}: SubmitActionAreaProps) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 sm:mx-0 sm:flex-row sm:justify-end sm:rounded-b-lg sm:border-x sm:border-b-0",
        className,
      )}
    >
      {onCancel ? (
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading} className="sm:w-auto">
          {cancelLabel}
        </Button>
      ) : null}
      <Button type="submit" disabled={disabled || loading} className="sm:w-auto">
        {loading ? "Saving…" : submitLabel}
      </Button>
    </div>
  );
}
