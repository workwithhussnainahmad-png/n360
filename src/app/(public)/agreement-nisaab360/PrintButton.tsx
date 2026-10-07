"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";

export function PrintButton({ title }: { title: string }) {
  const [originalTitle, setOriginalTitle] = useState("");

  useEffect(() => {
    setOriginalTitle(document.title);
  }, []);

  const handlePrint = () => {
    document.title = title;
    window.print();
    // Restore original title after a short delay so the print dialog uses the custom title
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <Button onClick={handlePrint} className="print:hidden">
      <Printer className="mr-2 h-4 w-4" />
      Download PDF
    </Button>
  );
}
