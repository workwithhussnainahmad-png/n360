"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export type PromotionReviewCsvRow = {
  roll: string;
  student: string;
  total: number;
  percentage: number;
  status: string;
  subjects: Record<string, string>;
};

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function PromotionReviewActions({
  fileName,
  subjects,
  rows,
}: {
  fileName: string;
  subjects: string[];
  rows: PromotionReviewCsvRow[];
}) {
  const downloadCsv = () => {
    const header = ["Roll", "Student", ...subjects, "Total", "Percentage", "Status"];
    const lines = [
      header.map(csvEscape).join(","),
      ...rows.map((row) => [
        row.roll,
        row.student,
        ...subjects.map((subject) => row.subjects[subject] || ""),
        row.total,
        row.percentage.toFixed(2),
        row.status,
      ].map(csvEscape).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
      <Button onClick={downloadCsv}>
        <Download className="mr-2 h-4 w-4" />
        Download CSV
      </Button>
    </div>
  );
}
