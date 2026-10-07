"use client";

import { useState } from "react";
import { CheckCircle2, Eye, Loader2, RefreshCw, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatClassSection } from "@/lib/class-section-label";

type Batch = {
  id: number;
  title: string;
  className: string;
  sectionName: string | null;
  subjectCount: number;
  allSubjectsPublished: boolean;
  officialPublishedAt: string | null;
};

export default function PromotionPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<number | null>(null);

  const readyCount = batches.filter((batch) => batch.allSubjectsPublished && !batch.officialPublishedAt).length;
  const completedCount = batches.filter((batch) => batch.officialPublishedAt).length;

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/institution/students/auto-promote");
    const data = await response.json();
    setBatches(data.batches || []);
    setMessage(response.ok ? "" : data.error || "Failed to load promotion batches.");
    setLoading(false);
    setLoaded(true);
  };

  // Intentionally no mount-time fetch: this page's data is only loaded
  // when the user explicitly clicks "Load promotion results" or "Refresh".

  const publish = async (id: number) => {
    setRunning(id);
    const response = await fetch("/api/institution/students/auto-promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchExamId: id }),
    });
    const data = await response.json();
    setMessage(response.ok
      ? `Official: ${data.result.promotedCount} promoted, ${data.result.retainedCount} retained, ${data.result.graduatedCount} graduated.`
      : data.error || "Promotion failed.");
    setRunning(null);
    await load();
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Auto Promotion</h1>
          <p className="mt-1 text-stone-500">Review teacher-published promotion results before making them official.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {loaded ? "Refresh" : "Load promotion results"}
        </Button>
      </div>

      {!loaded && !loading && (
        <Card>
          <CardContent className="p-6 text-center text-sm leading-6 text-stone-500">
            Click &ldquo;Load promotion results&rdquo; to fetch batches ready for review.
          </CardContent>
        </Card>
      )}

      {(loaded || loading) && (
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-8 w-8 text-brand-800" />
            <div>
              <p className="text-sm text-stone-500">Promotion results</p>
              <p className="text-2xl font-semibold">{batches.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-sm text-stone-500">Ready to publish</p>
              <p className="text-2xl font-semibold">{readyCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Send className="h-8 w-8 text-indigo-600" />
            <div>
              <p className="text-sm text-stone-500">Officially published</p>
              <p className="text-2xl font-semibold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {message && <p className="rounded-md border bg-white p-3 text-sm">{message}</p>}

      {(loaded || loading) && (
      <div className="space-y-3">
          {loading && <Card><CardContent className="p-5 text-center text-sm text-stone-500">Loading promotion results...</CardContent></Card>}
          {!loading && batches.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-sm text-stone-500">
                No Promotion results found yet. Create a result with type PROMOTION, then teachers must publish their subjects.
              </CardContent>
            </Card>
          )}
          {batches.map((batch) => {
            const isOfficial = Boolean(batch.officialPublishedAt);
            return (
              <Card key={batch.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{batch.title}</h2>
                        <Badge className={isOfficial ? "bg-indigo-100 text-indigo-700" : batch.allSubjectsPublished ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                          {isOfficial ? "Official" : batch.allSubjectsPublished ? "Ready" : "Awaiting teachers"}
                        </Badge>
                      </div>
                      <p className="text-sm text-stone-500">
                        Class {formatClassSection(batch.className, batch.sectionName, ", ")} - {batch.subjectCount} subjects
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/institution/students/promotion/${batch.id}`} target="_blank" rel="noreferrer">
                          <Eye className="mr-2 h-4 w-4" />
                          Review
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        disabled={!batch.allSubjectsPublished || isOfficial || running !== null}
                        onClick={() => publish(batch.id)}
                      >
                        {running === batch.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Promote & publish
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
      )}
    </div>
  );
}
