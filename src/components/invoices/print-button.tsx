"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** print: styles hide this control automatically — it only ever appears
 * on screen, never in the printed/PDF output. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer /> Print / Save as PDF
    </Button>
  );
}
