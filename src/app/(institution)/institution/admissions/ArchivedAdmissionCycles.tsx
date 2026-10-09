"use client";

import { useEffect, useState } from "react";
import { Archive, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PaymentProofHistory, type PaymentProofRecord } from "@/components/PaymentProofHistory";

type Cycle = { id: number; name: string; academicYear: string; archivedAt: string };
type Application = { id: number; applicationNumber: string; studentName: string; guardianName: string; guardianEmail: string; guardianPhone: string; status: string; offeringTitle: string; submittedAt: string };
type Detail = {
  application: Application;
  documents: Array<{ id: number; documentName: string; status: string; submittedFileKey: string | null; reviewerNote: string | null }>;
  appointments: Array<{ id: number; type: string; scheduledAt: string; location: string; outcome: string; outcomeNote: string | null }>;
  events: Array<{ id: number; title: string; description: string | null; createdAt: string }>;
  feePayment: { id: number; amount: number; status: string; proofFileKey: string | null; payerReference: string | null } | null;
  feeProofHistory: PaymentProofRecord[];
  enrollment: { studentId: number; loginRollNumber: string; createdAt: string } | null;
};

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to load admission history");
  return data;
}

export function ArchivedAdmissionCycles({ onRestored }: { onRestored?: () => void } = {}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ cycles: Cycle[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Cycle | null>(null);
  const [restore, setRestore] = useState<Cycle | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setData(null); setError("");
      read<{ cycles: Cycle[]; total: number }>(`/api/institution/admissions?archived=1&page=${page}&search=${encodeURIComponent(search)}`, controller.signal)
        .then((value) => { if (!controller.signal.aborted) setData(value); })
        .catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, page, reload]);

  if (selected) return <div className="space-y-4"><Button variant="outline" onClick={() => setSelected(null)}><ArrowLeft size={15} className="mr-2" />Archived cycles</Button><ArchiveApplications key={selected.id} cycle={selected} /></div>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-stone-500">Archived cycles preserve all admission records. Restored cycles stay closed.</p><input aria-label="Search archived cycles" placeholder="Search cycle or academic year" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus-ring sm:max-w-xs" /></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-stone-500">Loading archived cycles...</p>}
    {data?.cycles.length === 0 && <Card><CardContent className="p-6 text-sm text-stone-500">No archived cycles found.</CardContent></Card>}
    {data?.cycles.map((cycle) => <Card key={cycle.id}><CardContent className="flex flex-wrap items-center justify-between gap-5 p-5">
      <div className="min-w-0 space-y-1"><h2 className="flex items-center gap-2 break-words text-base font-semibold"><Archive size={17} className="shrink-0 text-brand-700" />{cycle.name}</h2><p className="text-xs text-stone-500">Academic year {cycle.academicYear} · Archived {new Date(cycle.archivedAt).toLocaleDateString()}</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setSelected(cycle)}>View history</Button><Button size="sm" variant="outline" onClick={() => setRestore(cycle)}><RotateCcw size={14} className="mr-2" />Restore</Button></div>
    </CardContent></Card>)}
    {data && data.total > 20 && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Page {page} of {Math.ceil(data.total / 20)}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    <Dialog open={Boolean(restore)} onOpenChange={(open) => { if (!open && !busy) setRestore(null); }}><DialogContent><DialogHeader><DialogTitle>Restore admission cycle?</DialogTitle><DialogDescription>{restore?.name} will return to Open / close. The cycle and all campus intakes will stay closed until explicitly reopened.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRestore(null)}>Cancel</Button><Button disabled={busy} onClick={async () => {
      if (!restore) return; setBusy(true); setError("");
      try { const response = await fetch("/api/institution/admissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restoreCycle", cycleId: restore.id }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to restore cycle"); setRestore(null); setPage(1); setReload((value) => value + 1); onRestored?.(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to restore cycle"); } finally { setBusy(false); }
    }}>Restore closed cycle</Button></div></DialogContent></Dialog>
  </div>;
}

function ArchiveApplications({ cycle }: { cycle: Cycle }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ applications: Application[]; pagination: { total: number; pages: number } } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setData(null); setError("");
      read<{ applications: Application[]; pagination: { total: number; pages: number } }>(`/api/institution/admissions/applications?history=1&cycle=${cycle.id}&page=${page}&pageSize=20&q=${encodeURIComponent(search)}`, controller.signal).then((value) => { if (!controller.signal.aborted) setData(value); }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [cycle.id, page, search]);
  useEffect(() => {
    if (selectedId === null) return;
    const controller = new AbortController();
    read<Detail>(`/api/institution/admissions/applications/${selectedId}`, controller.signal).then((value) => { if (!controller.signal.aborted) setDetail(value); }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [selectedId]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-base font-semibold">{cycle.name}</h2><p className="text-xs text-stone-500">Preserved history for this workspace, including enrolled applicants.</p></div><input aria-label="Search archived applications" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search applicant or application number" className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus-ring sm:max-w-xs" /></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!data && !error && <p role="status" className="text-sm text-stone-500">Loading application history...</p>}
    {data?.applications.length === 0 && <p className="text-sm text-stone-500">No application records found for this workspace.</p>}
    {data?.applications.map((application) => <Card key={application.id}><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0 space-y-1"><h3 className="break-words text-sm font-semibold">{application.studentName}</h3><p className="break-words text-xs text-stone-500">{application.applicationNumber} · {application.offeringTitle} · {application.status.replaceAll("_", " ")}</p></div><Button size="sm" variant="outline" onClick={() => { setDetail(null); setSelectedId(application.id); }}>View record</Button></CardContent></Card>)}
    {data && data.pagination.pages > 1 && <div className="flex items-center justify-between gap-3"><span className="text-xs">Page {page} of {data.pagination.pages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
    <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) { setSelectedId(null); setDetail(null); } }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{detail?.application.studentName || "Application history"}</DialogTitle><DialogDescription>Saved admission record. This view does not change application data.</DialogDescription></DialogHeader>{!detail ? <p className="text-sm">{error || "Loading record..."}</p> : <div className="space-y-6 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">{[["Application", detail.application.applicationNumber], ["Status", detail.application.status.replaceAll("_", " ")], ["Guardian", detail.application.guardianName], ["Email", detail.application.guardianEmail], ["Phone", detail.application.guardianPhone]].map(([label, value]) => <div key={label} className="break-words"><dt className="text-xs text-stone-500">{label}</dt><dd className="mt-1">{value}</dd></div>)}</dl>
      <section className="space-y-3"><h3 className="font-semibold">Documents</h3>{detail.documents.length === 0 && <p>No documents recorded.</p>}{detail.documents.map((document) => <div key={document.id} className="rounded-md border p-3"><p>{document.documentName} · {document.status}</p>{document.reviewerNote && <p className="mt-1 text-xs text-stone-500">{document.reviewerNote}</p>}{document.submittedFileKey && <a className="mt-2 inline-block underline" href={`/api/institution/admissions/files/document/${document.id}`} target="_blank" rel="noopener noreferrer">View saved document</a>}</div>)}</section>
      <section className="space-y-3"><h3 className="font-semibold">Payments and screenshots</h3>{detail.feePayment ? <div className="rounded-md border p-3"><p>PKR {detail.feePayment.amount.toLocaleString()} · {detail.feePayment.status}</p><p className="mt-1">Transaction: {detail.feePayment.payerReference || "Not recorded"}</p>{detail.feePayment.proofFileKey && <a className="mt-2 inline-block underline" href={`/api/institution/admissions/files/fee/${detail.feePayment.id}`} target="_blank" rel="noopener noreferrer">View saved payment screenshot</a>}</div> : <p>No admission payment recorded.</p>}<PaymentProofHistory records={detail.feeProofHistory || []} fileBase="/api/institution/admissions/files/fee-proof" /></section>
      <section className="space-y-2"><h3 className="font-semibold">Enrollment</h3><p>{detail.enrollment ? `Enrolled as ${detail.enrollment.loginRollNumber} on ${new Date(detail.enrollment.createdAt).toLocaleDateString()}` : "No enrollment recorded."}</p></section>
      <section className="space-y-3"><h3 className="font-semibold">Tests and interviews</h3>{detail.appointments.map((appointment) => <p key={appointment.id}>{appointment.type} · {new Date(appointment.scheduledAt).toLocaleString()} · {appointment.location} · {appointment.outcome} {appointment.outcomeNote}</p>)}</section>
      <section className="space-y-3"><h3 className="font-semibold">Admission timeline</h3>{detail.events.map((event) => <div key={event.id} className="border-l-2 pl-3"><p className="font-medium">{event.title}</p><p className="mt-1 text-xs text-stone-500">{new Date(event.createdAt).toLocaleString()}</p>{event.description && <p className="mt-1 whitespace-pre-wrap">{event.description}</p>}</div>)}</section>
    </div>}</DialogContent></Dialog>
  </div>;
}
