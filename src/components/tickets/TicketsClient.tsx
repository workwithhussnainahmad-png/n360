"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Plus, Send, Ticket } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import styles from "./tickets.module.css";

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
    } catch (error: unknown) {
      toast({ title: "Could not create ticket", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <Card className={styles.panel}>
        <CardHeader className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headingIcon}><Ticket size={19} aria-hidden="true" /></span>
            <div>
              <CardTitle className={styles.title}>Your tickets</CardTitle>
              <p className={styles.subtitle}>Track requests to your institution.</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className={styles.createButton}><Plus className="h-4 w-4" aria-hidden="true" />Create ticket</Button>
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
                <DialogFooter className="gap-2 sm:space-x-0">
                  <Button type="button" variant="outline" disabled={submitting} onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting} className="gap-2">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {submitting ? "Submitting..." : "Submit Ticket"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0" aria-busy={loading}>
          {loading ? (
            <div className={styles.empty} role="status"><Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /><p>Loading tickets...</p></div>
          ) : tickets.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><Ticket size={26} aria-hidden="true" /></span>
              <h2>No tickets yet</h2>
              <p>Need help? Create a ticket with the details of your issue. You can follow its progress here.</p>
            </div>
          ) : (
            <>
              <div className={styles.list}>
                {tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
              </div>
              {nextCursor && (
                <div className={styles.pagination}>
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
    : ticket.status === "FORWARDED"
      ? { label: "Forwarded", className: "bg-blue-100 text-blue-700", icon: Send }
      : ticket.status === "WORKING"
        ? { label: "In progress", className: "bg-warning/20 text-yellow-700", icon: Clock }
        : { label: "Open", className: "bg-blue-100 text-blue-700", icon: AlertCircle };
  const Icon = status.icon;

  return <article className={styles.row}>
    <div className={styles.rowHeading}>
      <div className={styles.subject}>
        <span className={styles.reference}>Ticket #{ticket.id}</span>
        <h2>{ticket.title}</h2>
      </div>
      <span className={`${styles.status} ${status.className}`}><Icon size={14} aria-hidden="true" />{status.label}</span>
    </div>
    <p className={styles.description}>{ticket.description}</p>
    <p className={styles.timestamp}>Created <time dateTime={ticket.createdAt}>{new Date(ticket.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></p>
  </article>;
}
