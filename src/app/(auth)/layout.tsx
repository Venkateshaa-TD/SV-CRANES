import { Truck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Truck className="size-5" aria-hidden="true" />
        </div>
        <span className="text-lg font-semibold text-foreground">FleetView</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
