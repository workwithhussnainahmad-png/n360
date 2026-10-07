"use client";

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Download, CheckCircle2, AlertTriangle, Edit2, Save, X } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { formatClassSection } from "@/lib/class-section-label";

export default function BatchResultDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [promotionMessage, setPromotionMessage] = useState("");

  const fetchDetails = () => {
    fetch(`/api/staff/batch-results/${resolvedParams.id}`)
      .then(res => res.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDetails();
  }, [resolvedParams.id]);

  const handleDownload = () => {
    if (!data) return;
    const csvData = data.results.map((r: any) => ({
      "Name": r.studentName,
      "Roll Number": r.rollNumber,
      "Marks": r.marksObtained
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${data.subject.examTitle}_${data.subject.subjectName}_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveEdit = async (resultId: number) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/staff/batch-results/${resolvedParams.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, newMarks: Number(editValue) })
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      
      setEditingId(null);
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const confirmPublish = async () => {
    setIsPublishing(true);
    try {
      const res = await fetch(`/api/staff/batch-results/${resolvedParams.id}`, {
        method: "POST"
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setIsPublishModalOpen(false);
      if (d.autoPromotion?.promoted) {
        setPromotionMessage(`Promotion completed: ${d.autoPromotion.promotedCount} promoted, ${d.autoPromotion.retainedCount} retained${d.autoPromotion.graduatedCount ? `, ${d.autoPromotion.graduatedCount} graduated` : ""}.`);
      } else if (d.autoPromotion?.reason === "awaiting_subjects") {
        setPromotionMessage("This subject is published. Promotion will run automatically when every subject result is published.");
      } else if (d.autoPromotion?.reason === "missing_grading_scale") {
        setPromotionMessage("Promotion could not run: the institution must configure a grading scale first.");
      } else if (d.autoPromotion?.reason && d.autoPromotion.reason !== "not_promotion") {
        setPromotionMessage(`Promotion could not run: ${d.autoPromotion.reason.replaceAll("_", " ")}.`);
      }
      fetchDetails();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded-md">{error}</div>;
  if (!data) return null;

  const { subject, results } = data;
  const isReadOnly = subject.isEffectivelyPublished;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href="/batch-results" prefetch={false}>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-display text-3xl font-bold text-brand-950">{subject.subjectName} Results</h1>
          <p className="text-stone-500 text-sm">{subject.examTitle} • {formatClassSection(subject.className, subject.sectionName)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-4 bg-white rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-3">
          {isReadOnly ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1.5 rounded-full text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Published
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full text-sm font-medium border border-amber-200">
              <AlertTriangle className="h-4 w-4" />
              Pending Review
            </div>
          )}
          <div className="text-sm text-stone-600">Max Marks: <strong>{subject.maxMarks}</strong></div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleDownload} className="flex-1 sm:flex-none">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          {!isReadOnly && (
            <Button onClick={() => setIsPublishModalOpen(true)} disabled={isPublishing} className="flex-1 sm:flex-none">
              Publish Results
            </Button>
          )}
        </div>
      </div>

      {promotionMessage && <div className="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">{promotionMessage}</div>}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-stone-50 text-stone-700 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium">Roll Number</th>
                <th className="px-6 py-3 font-medium">Student Name</th>
                <th className="px-6 py-3 font-medium">Marks Obtained</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((r: any) => (
                <tr key={r.id} className="hover:bg-stone-50/50">
                  <td className="px-6 py-4">{r.rollNumber}</td>
                  <td className="px-6 py-4 font-medium text-stone-900">{r.studentName}</td>
                  <td className="px-6 py-4">
                    {editingId === r.id ? (
                      <input 
                        type="number" 
                        className="w-20 rounded-md border border-brand-300 px-2 py-1 text-sm focus:ring-2 focus:ring-brand-500" 
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        max={subject.maxMarks}
                      />
                    ) : (
                      <span className="font-semibold">{r.marksObtained}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingId === r.id ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={isUpdating}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(r.id)} disabled={isUpdating}>
                          <Save className="h-4 w-4 mr-1" /> Save
                        </Button>
                      </div>
                    ) : (
                      !isReadOnly && !r.isEdited ? (
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(r.id); setEditValue(String(r.marksObtained)); }} className="text-brand-600">
                          <Edit2 className="h-4 w-4 mr-1" /> Edit
                        </Button>
                      ) : r.isEdited ? (
                        <span className="text-xs text-stone-400 italic">Edited</span>
                      ) : null
                    )}
                  </td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                    No results found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isPublishModalOpen} onOpenChange={setIsPublishModalOpen}>
        <DialogContent>
          <DialogHeader className="text-left">
            <DialogTitle>Publish Results</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-stone-600">
	            Are you sure you want to publish these results? You won&apos;t be able to edit them afterwards.
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setIsPublishModalOpen(false)} disabled={isPublishing}>
              Cancel
            </Button>
            <Button onClick={confirmPublish} disabled={isPublishing}>
              {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
