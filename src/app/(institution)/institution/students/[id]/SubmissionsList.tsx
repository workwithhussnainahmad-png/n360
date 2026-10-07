"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type SubmissionRecord = {
  id: number;
  fileKey: string;
  createdAt: string; // ISO date string
  assignmentTitle: string;
  dueAt: string; // ISO date string
};

export function SubmissionsList({ records }: { records: SubmissionRecord[] }) {
  const [limit, setLimit] = useState(10);

  const handleShowMore = () => {
    if (limit === 10) setLimit(30);
    else setLimit(limit + 20); // subsequent paginations
  };

  const visibleRecords = records.slice(0, limit);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-stone-100 text-stone-600">
            <tr>
              <th className="px-4 py-2 font-medium">Assignment</th>
              <th className="px-4 py-2 font-medium">Submitted On</th>
              <th className="px-4 py-2 font-medium">File</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-4 sm:py-8 text-center text-stone-500">No submissions found.</td></tr>
            )}
            {visibleRecords.map(r => {
              const isLate = new Date(r.createdAt) > new Date(r.dueAt);
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-medium">
                    {r.assignmentTitle}
                    {isLate && <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">LATE</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-500">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-xs text-blue-600 truncate max-w-[200px]">
                    <a href={r.fileKey} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      View File
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {records.length > limit && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={handleShowMore}>
            Show More ({records.length - limit} left)
          </Button>
        </div>
      )}
    </div>
  );
}
