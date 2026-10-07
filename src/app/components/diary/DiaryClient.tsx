"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Save, X } from "lucide-react";

type HistoryEntry = {
  id: number;
  classId: number;
  subjectId: number | null;
  date: string;
  preview: string;
};

export default function DiaryClient() {
  const [classId, setClassId] = useState<number | "">("");
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [readOnlyEntry, setReadOnlyEntry] = useState<{ date: string; content: string } | null>(null);
  
  // Dropdown options
  const [assignedSections, setAssignedSections] = useState<any[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<any[]>([]);

  const { toast } = useToast();

  useEffect(() => {
    fetchMetadata();
  }, []);

  const fetchMetadata = async () => {
    try {
      const res = await fetch("/api/staff/assignments?view=metadata");
      if (res.ok) {
        const data = await res.json();
        
        // Extract unique classes from sections
        const uniqueClassesMap = new Map();
        if (data.sectionOptions) {
          data.sectionOptions.forEach((s: any) => {
            if (!uniqueClassesMap.has(s.classId)) {
              uniqueClassesMap.set(s.classId, { id: s.classId, name: s.className });
            }
          });
        }
        setAssignedSections(Array.from(uniqueClassesMap.values()));
        setAssignedSubjects(data.subjectOptions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDiary = async () => {
    if (classId === "" || subjectId === "") {
      setContent("");
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        classId: String(classId),
        subjectId: String(subjectId),
        date,
      });
      params.set("view", "entry");
      const res = await fetch(`/api/staff/diary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.diary?.content || "");
      }
    } catch (error) {
      console.error("Failed to fetch diaries", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async (cursor?: string) => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({ view: "history" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/staff/diary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch history");
      const data = await res.json();
      setHistoryEntries((current) => cursor ? [...current, ...data.entries] : data.entries);
      setHistoryCursor(data.nextCursor);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load past diary entries.", variant: "destructive" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryEntry = async (entry: HistoryEntry) => {
    if (entry.subjectId !== null) {
      setReadOnlyEntry(null);
      setClassId(entry.classId);
      setSubjectId(entry.subjectId);
      setDate(entry.date);
      return;
    }

    try {
      const params = new URLSearchParams({ view: "entry", classId: String(entry.classId), date: entry.date });
      const res = await fetch(`/api/staff/diary?${params}`);
      if (!res.ok) throw new Error("Failed to fetch diary entry");
      const data = await res.json();
      if (data.diary) setReadOnlyEntry({ date: entry.date, content: data.diary.content });
    } catch (error) {
      toast({ title: "Error", description: "Failed to open this diary entry.", variant: "destructive" });
    }
  };

  useEffect(() => {
    void fetchDiary();
  }, [classId, subjectId, date]);

  useEffect(() => {
    if (historyOpen && historyEntries.length === 0) void fetchHistory();
  }, [historyOpen]);

  const handleSave = async () => {
    if (!content) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/staff/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, subjectId, date, content }),
      });

      if (!res.ok) throw new Error("Failed to save");

      toast({ title: "Success", description: "Diary entry saved successfully." });
      await fetchDiary();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create diary entry.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
        <h2 className="text-lg font-semibold mb-4">Daily Diary Entry</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-sm font-medium text-stone-700">Class</label>
            <select
              className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 mt-1"
              value={classId}
              onChange={(e) => setClassId(parseInt(e.target.value) || "")}
            >
              <option value="">Select a Class</option>
              {assignedSections.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700">Subject</label>
            <select
              className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 mt-1"
              value={subjectId}
              onChange={(e) => setSubjectId(parseInt(e.target.value) || "")}
            >
              <option value="">Select a Subject</option>
              {assignedSubjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-stone-700">Date</label>
            <input
              type="date"
              className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 mt-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-4">
          <textarea
            placeholder="What is the homework or classwork for today?"
            className="w-full bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 min-h-[120px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Button onClick={handleSave} disabled={isSaving || !content} className="bg-brand-600 hover:bg-brand-700 w-full sm:w-auto">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Entry
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="text-lg font-semibold">Past entries</h2><p className="text-sm text-stone-500">Load previous entries only when you need to browse them.</p></div>
          <Button variant="outline" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide history" : "Browse history"}</Button>
        </div>
        {historyOpen && <div className="mt-4 space-y-3">
          {historyEntries.map((entry) => <button key={entry.id} type="button" onClick={() => void openHistoryEntry(entry)} className="block w-full rounded-lg border border-stone-200 p-4 text-left hover:bg-stone-50">
            <div className="flex justify-between gap-3 text-xs text-stone-500"><span>Class {entry.classId} {entry.subjectId === null ? "· General entry" : `· Subject ${entry.subjectId}`}</span><span>{entry.date}</span></div>
            <p className="mt-2 line-clamp-3 text-sm text-stone-700">{entry.preview}</p>
          </button>)}
          {historyEntries.length === 0 && !historyLoading && <p className="text-sm text-stone-500">No past entries yet.</p>}
          {historyLoading && <p className="text-sm text-stone-500">Loading history…</p>}
          {historyCursor && !historyLoading && <Button variant="outline" onClick={() => void fetchHistory(historyCursor)}>Load more</Button>}
        </div>}
      </div>

      {readOnlyEntry && <div className="rounded-xl border border-stone-200 bg-stone-50 p-6">
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">General diary entry</h2><p className="text-sm text-stone-500">{readOnlyEntry.date} · Read-only because it is not subject-specific.</p></div><Button variant="ghost" size="icon" onClick={() => setReadOnlyEntry(null)} aria-label="Close general diary entry"><X className="h-4 w-4" /></Button></div>
        <p className="mt-4 whitespace-pre-wrap text-sm text-stone-700">{readOnlyEntry.content}</p>
      </div>}
    </div>
  );
}
