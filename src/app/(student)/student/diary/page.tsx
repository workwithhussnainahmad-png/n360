"use client";

import { useState, useEffect } from "react";
import { Loader2, BookOpen, CalendarDays } from "lucide-react";

type DiaryEntry = {
  id: number;
  subjectId: number;
  subjectName: string | null;
  staffName: string | null;
  content: string;
};

export default function StudentDiaryPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(true);

  useEffect(() => {
    handleSearch();
  }, [date]); // Re-fetch when date changes

  const handleSearch = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/student/diary?date=${date}`);
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
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center font-display text-3xl font-bold text-brand-950">
            <BookOpen className="w-6 h-6 mr-3 text-brand-600" />
            My Daily Diary
          </h1>
          <p className="mt-1 text-stone-500">Check your daily homework and classwork updates.</p>
        </div>
        
        <div className="flex items-center space-x-3 bg-white p-2 rounded-xl border border-stone-200 shadow-sm">
          <CalendarDays className="w-5 h-5 text-stone-400 ml-2" />
          <input
            type="date"
            className="bg-transparent border-none focus:ring-0 text-sm font-medium text-stone-700 w-[140px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-6 sm:p-12">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      )}

      {hasSearched && !isLoading && entries.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-stone-200 border-dashed shadow-sm">
          <div className="bg-brand-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-brand-500" />
          </div>
          <h3 className="text-xl font-medium text-stone-900 mb-1">No Diary Today</h3>
          <p className="text-stone-500 max-w-sm mx-auto">You have no homework or classwork recorded for {new Date(date).toLocaleDateString()}. Enjoy your day!</p>
        </div>
      )}

      {entries.length > 0 && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden hover:shadow-md transition-shadow relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-brand-500"></div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-stone-100">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm">
                      {(entry.subjectName || "Sub").substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-semibold text-stone-900">{entry.subjectName || `Subject #${entry.subjectId}`}</h4>
                      <p className="text-xs text-stone-500">Teacher: {entry.staffName || "Unknown"}</p>
                    </div>
                  </div>
                </div>
                <div className="text-stone-700 whitespace-pre-wrap text-sm leading-relaxed">
                  {entry.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
