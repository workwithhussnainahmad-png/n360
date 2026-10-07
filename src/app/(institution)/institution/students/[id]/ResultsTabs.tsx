"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type MarkRecord = {
  id: number;
  marksObtained: number;
  totalMarks: number;
  testTitle: string;
  date: string;
  testType: string;
};

export function ResultsTabs({ records }: { records: MarkRecord[] }) {
  const [activeTab, setActiveTab] = useState<string>("ALL");

  const types = ["ALL", ...Array.from(new Set(records.map(r => r.testType))).filter(Boolean)];
  
  const filteredRecords = activeTab === "ALL" 
    ? records 
    : records.filter(r => r.testType === activeTab);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 pb-2">
        {types.map(type => (
          <Button 
            key={type} 
            variant={activeTab === type ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(type)}
            className="h-7 text-xs px-3 rounded-full"
          >
            {type}
          </Button>
        ))}
      </div>
      
      <div className="custom-scrollbar max-h-[300px] overflow-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-stone-100 text-stone-600 sticky top-0">
            <tr>
              <th className="px-4 py-2 font-medium">Test</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRecords.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-4 sm:py-8 text-center text-stone-500">No results found for {activeTab}.</td></tr>
            )}
            {filteredRecords.map(r => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium">
                  {r.testTitle}
                  {activeTab === "ALL" && <span className="ml-2 text-[10px] uppercase tracking-wider text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">{r.testType}</span>}
                </td>
                <td className="px-4 py-2 text-stone-500">{r.date}</td>
                <td className="px-4 py-2 font-mono">
                  <span className={r.marksObtained / r.totalMarks >= 0.4 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                    {r.marksObtained}
                  </span>
                  <span className="text-stone-400"> / {r.totalMarks}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
