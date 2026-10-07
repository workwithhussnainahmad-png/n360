"use client";

import { useState } from "react";
import { Loader2, Search, BookOpen, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DiaryMonitorClient({ classes }: { classes: any[] }) {
  const [classId, setClassId] = useState<number | "">("");
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (classId === "") return;
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/institution/diary?classId=${classId}&date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      } else {
        setEntries([]);
      }
    } catch (error) {
      console.error("Failed to fetch diary entries:", error);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="flex items-center text-3xl font-display font-bold text-brand-950">
          <BookOpen className="w-6 h-6 mr-3 text-brand-600" />
          Class Daily Diary Monitor
        </h1>
        <p className="text-stone-500 mt-1">View the combined daily diary for any class on any date.</p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-sm font-medium text-stone-700">Class</label>
            <select
              className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 mt-1"
              value={classId}
              onChange={(e) => setClassId(parseInt(e.target.value) || "")}
            >
              <option value="">Select a Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700 flex items-center">
              <CalendarDays className="w-4 h-4 mr-1 text-stone-400" /> Date
            </label>
            <input
              type="date"
              className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Button onClick={handleSearch} disabled={isLoading || classId === ""} className="bg-brand-600 hover:bg-brand-700 w-full">
              {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Fetch Diary
            </Button>
          </div>
        </div>
      </div>

      {hasSearched && !isLoading && entries.length === 0 && (
        <div className="text-center py-6 sm:py-12 bg-white rounded-xl border border-stone-200 border-dashed">
          <BookOpen className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-stone-900">No entries found</h3>
          <p className="text-stone-500">No teachers have submitted a diary for this class on this date.</p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
          <div className="p-4 border-b border-stone-200 bg-stone-50 flex justify-between items-center">
            <h3 className="font-semibold text-stone-800">Combined Diary - {new Date(date).toLocaleDateString()}</h3>
            <span className="text-sm px-3 py-1 bg-white border border-stone-200 rounded-full text-stone-600 shadow-sm">
              Class: {classes.find(c => c.id === classId)?.name || classId}
            </span>
          </div>
          <div className="divide-y divide-stone-100">
            {entries.map((entry) => (
              <div key={entry.id} className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 font-bold">
                      {(entry.subjectName || "Sub").substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-semibold text-stone-900">{entry.subjectName || `Subject #${entry.subjectId}`}</h4>
                      <p className="text-sm text-stone-500">By {entry.staffName || "Unknown Teacher"}</p>
                    </div>
                  </div>
                </div>
                <div className="pl-13 text-stone-700 whitespace-pre-wrap ml-13 border-l-2 border-stone-100 pl-4 py-1">
                  {entry.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
