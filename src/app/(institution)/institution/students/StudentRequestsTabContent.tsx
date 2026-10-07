"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { StudentRequestsClient } from "./StudentRequestsClient";

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

function RequestsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-64 animate-pulse rounded-md bg-stone-100" />
          <div className="h-4 w-96 animate-pulse rounded-md bg-stone-100" />
        </div>
        <div className="h-10 w-24 animate-pulse rounded-md bg-stone-100" />
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-5 space-y-3">
            <div className="h-5 w-48 animate-pulse rounded-md bg-stone-100" />
            <div className="h-4 w-72 animate-pulse rounded-md bg-stone-100" />
            <div className="h-16 w-full animate-pulse rounded-md bg-stone-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentRequestsTabContent({
  active,
  classes,
  sections,
}: {
  active: boolean;
  classes: { id: number; name: string }[];
  sections: { id: number; name: string; classId: number }[];
}) {
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || requests !== null || loading) return;

    let ignore = false;
    setLoading(true);
    setError(null);

    api.get<{ requests: RequestRow[] }>("/api/institution/student-profile-requests")
      .then((data) => {
        if (!ignore) setRequests(data.requests);
      })
      .catch(() => {
        if (!ignore) setError("Could not load student requests. Please try again.");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [active, requests, loading]);

  if (requests === null) {
    if (error) {
      return <p className="p-4 text-sm text-danger">{error}</p>;
    }
    return <RequestsSkeleton />;
  }

  return <StudentRequestsClient requests={requests} classes={classes} sections={sections} />;
}
