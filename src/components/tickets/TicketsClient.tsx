"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Loader2, Plus, Send, Ticket } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";

type SupportTicket = {
  id: number;
  title: string;
  description: string;
  status: "OPEN" | "WORKING" | "RESOLVED" | "FORWARDED";
  createdAt: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function TicketsClient({
  initialTickets,
  initialNextCursor = null,
}: {
  initialTickets?: SupportTicket[];
  initialNextCursor?: string | null;
}) {
  const seededFromServer = initialTickets !== undefined;
  const router = useRouter();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(!seededFromServer);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadTickets = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true);
    try {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await api.get<{ tickets: SupportTicket[]; nextCursor: string | null }>(`/api/tickets${suffix}`);
      setTickets((current) => (cursor ? [...current, ...response.tickets] : response.tickets));
      setNextCursor(response.nextCursor);
    } catch (error: unknown) {
      toast({ title: "Could not load tickets", description: errorMessage(error), variant: "destructive" });
    } finally {
      if (!cursor) setLoading(false);
    }
  }, [toast]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await loadTickets(nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (seededFromServer) return;
    void loadTickets();
  }, [seededFromServer, loadTickets]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      await api.post("/api/tickets", {
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
      });
      toast({ title: "Ticket created", description: "Your institution support team has been notified.", variant: "success" });
      form.reset();
      setDialogOpen(false);
      await loadTickets();
      router.refresh();
    } catch (error: unknown) {
      toast({ title: "Could not create ticket", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Support Tickets</h1>
          <p className="mt-1 text-stone-500">Send a support request to your institution and track its progress.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Create Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create support ticket</DialogTitle>
              <DialogDescription>Describe the issue clearly so your institution can help quickly.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-stone-700">Subject</span>
                <Input name="title" required maxLength={255} placeholder="What do you need help with?" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-stone-700">Description</span>
                <textarea name="description" required rows={5} className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring" placeholder="Include the relevant details of your issue." />
              </label>
              <DialogFooter>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? "Submitting..." : "Submit Ticket"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle className="flex items-center gap-2 text-lg"><Ticket className="h-5 w-5 text-brand-700" />Your Tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-6 sm:p-10 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-6 sm:p-10 text-center text-stone-500"><Ticket className="mx-auto mb-3 h-10 w-10 text-stone-300" /><p>No support tickets yet.</p></div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
              </div>
              {nextCursor && (
                <div className="flex justify-center p-5">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const status = ticket.status === "RESOLVED"
    ? { label: "Resolved", className: "bg-success/15 text-emerald-700", icon: CheckCircle2 }
    : ticket.status === "WORKING"
      ? { label: "In progress", className: "bg-warning/20 text-yellow-700", icon: Clock }
      : { label: "Open", className: "bg-blue-100 text-blue-700", icon: AlertCircle };
  const Icon = status.icon;

  return <div className="p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="font-semibold text-brand-950">{ticket.title}</h2><p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{ticket.description}</p></div>
      <span className={`flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><Icon className="h-3.5 w-3.5" />{status.label}</span>
    </div>
    <p className="mt-3 text-xs text-stone-400">Created {new Date(ticket.createdAt).toLocaleString()}</p>
  </div>;
}
