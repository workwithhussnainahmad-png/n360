"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { Check, FilePenLine, X } from "lucide-react";
import { displaySectionName, formatClassSection } from "@/lib/class-section-label";

type RequestRow = {
  id: number;
  requestedFields: Record<string, string | number>;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  studentId: number;
  studentName: string;
  rollNumber: string;
  loginRollNumber: string;
  fatherName: string | null;
  className: string;
  sectionName: string;
};

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  fatherName: "Father name",
  classId: "Class",
  sectionId: "Section",
};

function formatFields(fields: Record<string, string | number>, classes: { id: number; name: string }[], sections: { id: number; name: string }[]) {
  return Object.entries(fields).map(([key, value]) => {
    let displayValue: string | number = value;
    if (key === "classId") displayValue = classes.find((classRow) => classRow.id === value)?.name || value;
    if (key === "sectionId") displayValue = displaySectionName(sections.find((section) => section.id === value)?.name) || "";
    return { label: FIELD_LABELS[key] || key, value: displayValue };
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function StudentRequestsClient({
  requests,
  classes,
  sections,
}: {
  requests: RequestRow[];
  classes: { id: number; name: string }[];
  sections: { id: number; name: string; classId: number }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const reviewRequest = async (requestId: number, status: "APPROVED" | "REJECTED") => {
    setReviewingId(requestId);
    try {
      await api.patch(`/api/institution/student-profile-requests/${requestId}`, { status });
      toast({
        title: status === "APPROVED" ? "Request approved" : "Request rejected",
        description: status === "APPROVED" ? "Student profile has been updated." : "Request was marked rejected.",
        variant: "success",
      });
      router.refresh();
    } catch (error: unknown) {
      toast({ title: "Could not review request", description: errorMessage(error), variant: "destructive" });
    } finally {
      setReviewingId(null);
    }
  };

  const pendingCount = requests.filter((request) => request.status === "PENDING").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Student Profile Requests</h1>
          <p className="text-stone-500 mt-1">Review student requests for name, class, section, and father name corrections.</p>
        </div>
        <div className="rounded-md border border-border bg-stone-50 px-4 py-3 text-sm">
          <span className="font-bold text-brand-950">{pendingCount}</span>
          <span className="ml-1 text-stone-500">pending</span>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FilePenLine className="h-5 w-5 text-brand-700" />
            Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <p className="p-4 sm:p-8 text-sm text-stone-500">No student profile requests yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {requests.map((request) => (
                <div key={request.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-brand-950">{request.studentName}</h3>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="mt-1 text-sm text-stone-500">
                        Roll {request.rollNumber} - {formatClassSection(request.className, request.sectionName)} - {request.loginRollNumber}
                      </p>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {formatFields(request.requestedFields, classes, sections).map((field) => (
                          <div key={field.label} className="rounded-md border border-border bg-stone-50/70 px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{field.label}</p>
                            <p className="mt-1 text-sm font-semibold text-brand-950">{field.value}</p>
                          </div>
                        ))}
                      </div>

                      <p className="mt-4 text-sm text-stone-600">{request.reason}</p>
                      {request.adminNote && <p className="mt-2 text-sm text-stone-500">Admin note: {request.adminNote}</p>}
                      <p className="mt-2 text-xs text-stone-400">{new Date(request.createdAt).toLocaleString()}</p>
                    </div>

                    {request.status === "PENDING" && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          className="gap-1"
                          disabled={reviewingId === request.id}
                          onClick={() => reviewRequest(request.id, "APPROVED")}
                        >
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          className="gap-1"
                          disabled={reviewingId === request.id}
                          onClick={() => reviewRequest(request.id, "REJECTED")}
                        >
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: RequestRow["status"] }) {
  const className = status === "APPROVED"
    ? "bg-success/15 text-emerald-700"
    : status === "REJECTED"
      ? "bg-danger/15 text-red-700"
      : "bg-warning/20 text-yellow-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{status}</span>;
}
