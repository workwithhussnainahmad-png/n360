"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, CheckCircle2, Clock, CalendarDays } from "lucide-react";
import Link from "next/link";
import { formatClassSection } from "@/lib/class-section-label";
function formatDistanceToNow(date: Date) {
  const diffInSeconds = Math.floor((date.getTime() - Date.now()) / 1000);
  if (diffInSeconds < 0) return "past";
  if (diffInSeconds < 60) return `${diffInSeconds} seconds`;
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes`;
  return `${Math.floor(diffInSeconds / 3600)} hours and ${Math.floor((diffInSeconds % 3600) / 60)} minutes`;
}

type BatchResult = {
  id: number;
  maxMarks: number;
  isPublished: boolean;
  isEffectivelyPublished: boolean;
  reviewDeadline: string;
  subjectName: string;
  examTitle: string;
  className: string;
  sectionName: string | null;
  createdAt: string;
};

export default function StaffBatchResultsPage() {
  const [results, setResults] = useState<BatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/staff/batch-results")
      .then(res => res.json())
      .then(data => {
        setResults(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Batch Results (Transcripts)</h1>
	        <p className="text-stone-500 mt-1">Review and publish your students&apos; marks for term exams.</p>
      </div>

      {results.length === 0 ? (
        <Card className="bg-stone-50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-48 text-stone-500">
            <CalendarDays className="h-10 w-10 mb-3 text-stone-400" />
            <p>No batch results assigned to you currently.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map(res => (
            <Card key={res.id} className="hover:shadow-md transition-all flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{res.subjectName}</CardTitle>
                    <CardDescription>{res.examTitle}</CardDescription>
                  </div>
                  {res.isEffectivelyPublished ? (
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      Published
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                      Pending Review
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between">
                <div className="text-sm text-stone-600 space-y-1 mb-4">
                  <p><strong>Class:</strong> {formatClassSection(res.className, res.sectionName)}</p>
                  <p><strong>Max Marks:</strong> {res.maxMarks}</p>
                  {!res.isEffectivelyPublished && (
                    <div className="flex items-center gap-1.5 text-amber-600 mt-2">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium text-xs">
                        Auto-publishes in {formatDistanceToNow(new Date(res.reviewDeadline))}
                      </span>
                    </div>
                  )}
                </div>
                
                <Link href={`/batch-results/${res.id}`} prefetch={false} className="w-full">
                  <Button variant="outline" className="w-full justify-between group">
                    View Details
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
