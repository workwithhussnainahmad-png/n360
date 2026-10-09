"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Preview = { previewHash: string; eligible: number; alreadyBilled: number; ready: number; zeroTotal: number; totalAmount: number; missingStudents: number; missingAmounts: Array<{classId:number;className:string;headName:string}> };
function Field({ label, children }: {label:string;children:React.ReactNode}) {
  return <label className="block space-y-1.5 text-left text-sm font-medium text-stone-700"><span>{label}</span>{children}</label>;
}
const selectClass = "h-11 w-full rounded-sm border border-border bg-white px-3 text-sm";
export function MonthlyBillingPanel({ month, disabled, onIssued }: {month:string;disabled:boolean;onIssued:(month:string)=>Promise<void>}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const billingMonth = String(form.get("billingMonth"));
    setBusy(true);
    try {
      const result = await api.post<Preview & {created:number}>("/api/institution/fees", {action: preview ? "generateMonth" : "previewMonth", billingMonth, dueDate:form.get("dueDate"), expectedPreviewHash:preview?.previewHash});
      if (!preview) setPreview(result);
      else {
        toast({title: `${result.created} monthly challans created`, variant:"success"});
        setPreview(null);
        await onIssued(billingMonth);
      }
    } catch(error) {
      setPreview(null);
      toast({title:"Billing could not continue",description:error instanceof Error ? error.message : "Please try again.",variant:"destructive"});
    } finally { setBusy(false); }
  }
  return <Card><CardHeader className="border-b bg-stone-50/60"><CardTitle>Monthly challans</CardTitle></CardHeader><CardContent className="p-5">
    <form onSubmit={submit} onChange={()=>setPreview(null)} className="space-y-4">
      <Field label="Billing month"><Input name="billingMonth" type="month" defaultValue={month} required /></Field>
      <Field label="Payment due date"><Input name="dueDate" type="date" required /></Field>
      <p className="text-xs leading-5 text-stone-500">Preview the bill first. Save every class amount explicitly; enter 0 for deliberately free fees. Existing monthly challans are skipped.</p>
      {disabled && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Add a monthly fee head and save its class amounts in Fee structure.</p>}
      {preview && <div className="space-y-3 rounded-md border p-4 text-sm" aria-live="polite">
        <dl className="grid grid-cols-2 gap-3"><div><dt className="text-stone-500">Ready</dt><dd>{preview.ready}</dd></div><div><dt className="text-stone-500">Already billed</dt><dd>{preview.alreadyBilled}</dd></div><div><dt className="text-stone-500">Zero-total challans</dt><dd>{preview.zeroTotal}</dd></div><div><dt className="text-stone-500">Total</dt><dd>PKR {preview.totalAmount.toLocaleString("en-PK")}</dd></div></dl>
        {preview.missingAmounts.length > 0 && <div className="rounded bg-amber-50 p-3 text-amber-900"><p>{preview.missingStudents} students have missing amounts. Billing is blocked until these are saved:</p><ul className="mt-2 list-disc space-y-1 pl-5">{preview.missingAmounts.map(row=><li key={`${row.classId}:${row.headName}`}>{row.className} — {row.headName}</li>)}</ul></div>}
        {preview.zeroTotal>0 && <p className="text-stone-500">Zero-total challans are recorded as paid, with no payment received.</p>}
      </div>}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || disabled || !!preview && (preview.missingAmounts.length>0 || preview.ready===0)}>{busy ? "Please wait…" : preview ? "Generate previewed challans" : "Preview billing"}</Button>{preview && <Button type="button" variant="outline" disabled={busy} onClick={()=>setPreview(null)}>Refresh preview</Button>}</div>
    </form>
  </CardContent></Card>;
}

type OneTimeInput = {batchId:string;label:string;feeHeadId:number;classId?:number;studentIds?:number[];amount:number;billingMonth:string;dueDate:string};
type BillingStudent = {id:number;name:string;loginRollNumber:string};
export function OneTimeBillingPanel({month,heads,classes,onIssued}:{month:string;heads:Array<{id:number;name:string}>;classes:Array<{id:number;name:string}>;onIssued:(month:string)=>Promise<void>}) {
  const {toast}=useToast();
  const [request,setRequest]=useState<OneTimeInput|null>(null);
  const [batchId,setBatchId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [formElement,setFormElement]=useState<HTMLFormElement|null>(null);
  const [individuals,setIndividuals]=useState(false);
  const [query,setQuery]=useState("");
  const [matches,setMatches]=useState<BillingStudent[]>([]);
  const [selected,setSelected]=useState<BillingStudent[]>([]);
  const [searchError,setSearchError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      setSearchError("");
      if(!individuals || query.trim().length<2){setMatches([]);return;}
      try {
        const result=await api.get<{students:BillingStudent[]}>(`/api/institution/students/picker?q=${encodeURIComponent(query.trim())}&limit=8`,{signal:controller.signal});
        if(!controller.signal.aborted)setMatches(result.students);
      } catch {if(!controller.signal.aborted){setMatches([]);setSearchError("Could not search students. Please try again.");}}
    },250);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[individuals,query]);
  function prepare(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=new FormData(event.currentTarget), id=batchId || crypto.randomUUID();
    const target=String(form.get("classId") || "");
    if(target==="students" && !selected.length){toast({title:"Select at least one student",variant:"destructive"});return;}
    setBatchId(id);setFormElement(event.currentTarget);
    setRequest({batchId:id,label:String(form.get("label")),feeHeadId:Number(form.get("feeHeadId")),classId:target && target!=="students" ? Number(target):undefined,studentIds:target==="students" ? selected.map(student=>student.id):undefined,amount:Number(form.get("amount")),billingMonth:String(form.get("billingMonth")),dueDate:String(form.get("dueDate"))});
  }
  async function issue() {
    if(!request)return;
    setBusy(true);
    try {
      const result=await api.post<{created:number;alreadyIssued:boolean}>("/api/institution/fees",{action:"issueOneTime",...request});
      toast({title:result.alreadyIssued ? "These challans were already issued" : `${result.created} one-time challans created`,variant:"success"});
      setRequest(null);setBatchId(null);setIndividuals(false);setSelected([]);setQuery("");formElement?.reset();await onIssued(request.billingMonth);
    } catch(error) {toast({title:"Could not issue one-time challans",description:error instanceof Error ? error.message:"Please try again.",variant:"destructive"});}
    finally {setBusy(false);}
  }
  return <Card className="lg:col-span-2"><CardHeader className="border-b bg-stone-50/60"><CardTitle>One-time event or special charge</CardTitle></CardHeader><CardContent className="p-5">
    <form onSubmit={prepare} onChange={()=>setBatchId(null)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Charge name"><Input name="label" placeholder="Annual trip, examination…" minLength={2} maxLength={120} required /></Field>
        <Field label="One-time fee head"><select name="feeHeadId" className={selectClass} required><option value="">Select a fee head</option>{heads.map(head=><option key={head.id} value={head.id}>{head.name}</option>)}</select></Field>
        <Field label="Students"><select name="classId" className={selectClass} onChange={event=>setIndividuals(event.target.value==="students")}><option value="">All active students</option>{classes.map(row=><option key={row.id} value={row.id}>Class: {row.name}</option>)}<option value="students">Select individual students</option></select></Field>
        <Field label="Amount per student"><Input name="amount" type="number" min={1} max={10000000} required /></Field>
        <Field label="Billing month"><Input name="billingMonth" type="month" defaultValue={month} required /></Field>
        <Field label="Payment due date"><Input name="dueDate" type="date" required /></Field>
      </div>
      {individuals && <div className="space-y-3 rounded-md border p-4">
        <Field label="Find students"><Input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Student name or roll number" /></Field>
        {searchError && <p role="alert" className="text-sm text-red-700">{searchError}</p>}
        {matches.filter(student=>!selected.some(row=>row.id===student.id)).map(student=><button key={student.id} type="button" className="block w-full rounded border px-3 py-2 text-left text-sm hover:bg-stone-50" onClick={()=>{setSelected(rows=>[...rows,student]);setQuery("");setMatches([]);setBatchId(null);}}><span className="font-medium">{student.name}</span><span className="ml-2 text-xs text-stone-500">{student.loginRollNumber}</span></button>)}
        <p className="text-xs text-stone-500">{selected.length} students selected</p>
        <div className="flex flex-wrap gap-2">{selected.map(student=><Button key={student.id} size="sm" variant="outline" type="button" className="max-w-full whitespace-normal text-left" onClick={()=>{setSelected(rows=>rows.filter(row=>row.id!==student.id));setBatchId(null);}} aria-label={`Remove ${student.name}`}>{student.name} ×</Button>)}</div>
      </div>}
      <p className="text-xs leading-5 text-stone-500">Creates a separate challan alongside monthly tuition. This charge does not repeat next month.</p>
      {!heads.length && <p className="text-sm text-amber-900">Add a One-time fee head in Fee structure first.</p>}
      <Button disabled={busy || !heads.length}>Review one-time charge</Button>
    </form>
    <Dialog open={request!==null} onOpenChange={open=>{if(!open && !busy)setRequest(null);}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Issue one-time challans?</DialogTitle><DialogDescription>Each selected active student receives a separate challan. Existing tuition and payments stay unchanged.</DialogDescription></DialogHeader>
      {request && <dl className="space-y-3 rounded border p-4 text-sm"><div><dt className="text-stone-500">Charge</dt><dd className="break-words font-semibold">{request.label}</dd></div><div><dt className="text-stone-500">Recipients</dt><dd>{request.studentIds ? `${request.studentIds.length} selected students` : request.classId ? classes.find(row=>row.id===request.classId)?.name : "All active students"}</dd></div><div><dt className="text-stone-500">Per student</dt><dd>PKR {request.amount.toLocaleString("en-PK")}</dd></div><div><dt className="text-stone-500">Due date</dt><dd>{request.dueDate}</dd></div></dl>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setRequest(null)}>Cancel</Button><Button disabled={busy} onClick={()=>void issue()}>{busy ? "Issuing…":"Issue challans"}</Button></div>
    </DialogContent></Dialog>
  </CardContent></Card>;
}
