"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";

export function ParentRequestActions({ studentId, defaultPhone }: { studentId: number; defaultPhone?: string | null }) {
  const router = useRouter(); const { toast } = useToast(); const [leaveOpen, setLeaveOpen] = useState(false); const [supportOpen, setSupportOpen] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>, kind: "LEAVE" | "SUPPORT") {
    event.preventDefault(); setBusy(true); const form = event.currentTarget; const data = new FormData(form);
    try {
      await api.post("/api/parent/requests", kind === "LEAVE" ? { kind, studentId, reason: data.get("reason"), startDate: data.get("startDate"), endDate: data.get("endDate"), parentPhone: data.get("parentPhone") } : { kind, studentId, title: data.get("title"), description: data.get("description") });
      toast({ title: kind === "LEAVE" ? "Leave request submitted" : "Support request submitted", variant: "success" }); form.reset(); setLeaveOpen(false); setSupportOpen(false); router.refresh();
    } catch (error) { toast({ title: "Could not submit request", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }); } finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-3">
    <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}><DialogTrigger asChild><Button className="gap-2"><CalendarPlus className="h-4 w-4" />Request student leave</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Request student leave</DialogTitle><DialogDescription>The institution or class teacher will review this application.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => submit(event, "LEAVE")}><div className="grid gap-4 sm:grid-cols-2"><Field label="From"><Input name="startDate" type="date" required /></Field><Field label="To"><Input name="endDate" type="date" required /></Field></div><Field label="Parent phone"><Input name="parentPhone" defaultValue={defaultPhone || ""} required maxLength={50} /></Field><Field label="Reason"><textarea name="reason" required minLength={5} maxLength={1000} rows={4} className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring" /></Field><DialogFooter><Button disabled={busy} type="submit">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit leave request</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={supportOpen} onOpenChange={setSupportOpen}><DialogTrigger asChild><Button variant="outline" className="gap-2"><MessageSquarePlus className="h-4 w-4" />Contact institution</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Contact institution support</DialogTitle><DialogDescription>Send a question or concern linked to the selected student.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => submit(event, "SUPPORT")}><Field label="Subject"><Input name="title" required minLength={3} maxLength={255} /></Field><Field label="Message"><textarea name="description" required minLength={5} maxLength={3000} rows={5} className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring" /></Field><DialogFooter><Button disabled={busy} type="submit">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send message</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-sm font-medium text-stone-700">{label}</span>{children}</label>; }
