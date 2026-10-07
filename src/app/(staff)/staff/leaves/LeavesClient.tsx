"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Calendar, MessageSquare, Phone } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { formatClassSection } from "@/lib/class-section-label";

type LeaveRequest = {
  id: number;
  studentName: string;
  className: string;
  sectionName: string;
  reason: string;
  startDate: string;
  endDate: string;
  parentPhone: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
};

export function LeavesClient({ initialRequests }: { initialRequests: LeaveRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const { toast } = useToast();

  const handleAction = async (id: number, action: "APPROVED" | "REJECTED") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/staff/leaves/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });

      if (!res.ok) {
        throw new Error("Failed to update leave request");
      }

      setRequests((prev) => prev.filter((req) => req.id !== id));

      toast({
        title: "Success",
        description: `Leave request ${action.toLowerCase()} successfully.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update leave request",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-stone-500">
            No leave requests found.
          </CardContent>
        </Card>
      ) : (
        requests.map((req) => (
          <Card key={req.id} className="overflow-hidden border-border bg-surface shadow-sm rounded-lg hover:shadow-md transition-shadow duration-200">
            <div className="flex flex-col sm:flex-row border-b border-border sm:border-b-0">
              {/* Info Section */}
              <div className="flex-1 p-5 sm:p-6 sm:border-r border-border flex flex-col justify-between">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md bg-brand-800 text-stone-50 flex items-center justify-center font-display font-bold text-lg">
                      {req.studentName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-foreground text-lg leading-none">{req.studentName}</h3>
                      <p className="text-sm text-stone-500 mt-1">Class {formatClassSection(req.className, req.sectionName)}</p>
                    </div>
                  </div>
                  <div className="text-right text-sm text-stone-500 font-medium whitespace-nowrap">
                    {format(new Date(req.createdAt), "MMM d, yyyy")}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4 p-4 bg-stone-50 rounded-md border border-stone-100">
                  <div>
                    <p className="text-stone-500 text-xs uppercase tracking-wider mb-1 font-semibold">Start Date</p>
                    <p className="font-medium text-foreground">{format(new Date(req.startDate), "MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-stone-500 text-xs uppercase tracking-wider mb-1 font-semibold">End Date</p>
                    <p className="font-medium text-foreground">{format(new Date(req.endDate), "MMM d, yyyy")}</p>
                  </div>
                  {req.parentPhone && (
                    <div className="mt-1 border-t border-stone-200/50 pt-2 sm:col-span-2">
                      <p className="text-stone-500 text-xs uppercase tracking-wider mb-1 font-semibold">Parent Contact</p>
                      <p className="font-medium text-foreground">{req.parentPhone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reason & Action Section */}
              <div className="flex-1 flex flex-col p-5 sm:p-6 bg-stone-50/30">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-stone-900 mb-2">Reason for Leave</h4>
                  <div className="text-sm text-stone-600 leading-relaxed border-l-2 border-brand-300 pl-3 italic whitespace-pre-wrap">
	                    &quot;{req.reason}&quot;
                  </div>
                </div>

                {req.status === "PENDING" && (
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-stone-100">
                    <Button
                      onClick={() => handleAction(req.id, "APPROVED")}
                      disabled={processingId === req.id}
                      className="flex-1 bg-brand-800 hover:bg-brand-900 text-white"
                    >
                      {processingId === req.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Approve Leave
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleAction(req.id, "REJECTED")}
                      disabled={processingId === req.id}
                      className="flex-1 text-danger border-danger/20 hover:bg-danger hover:text-white"
                    >
                      {processingId === req.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
