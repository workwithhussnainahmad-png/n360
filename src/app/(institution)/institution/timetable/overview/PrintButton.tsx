"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="print:hidden bg-white hover:bg-stone-50"
      onClick={() => window.print()}
    >
      <Printer className="mr-2 h-4 w-4" />
      Print Timetable
    </Button>
  );
}
