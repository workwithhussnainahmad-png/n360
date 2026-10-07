"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { BriefcaseBusiness, CalendarClock, KeyRound, Mail, Send, UserRound } from "lucide-react";
import { ProfilePictureUploader } from "@/components/ProfilePictureUploader";
import { CourseStreamingSettings } from "@/components/CourseStreamingSettings";
import { formatClassSection } from "@/lib/class-section-label";

type StaffProfile = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  campusId: number | null;
  campusName: string;
  isActive: boolean;
  joinedAt: string;
  profilePictureUrl?: string | null;
};

type Assignment = {
  id: number;
  subject: string | null;
  className: string;
  sectionName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type ProfileRequest = {
  id: number;
  requestedFields: Record<string, string | number>;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  campusId: "Campus",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function formatRequestedFields(fields: Record<string, string | number>, campuses: { id: number; name: string }[]) {
  return Object.entries(fields).map(([key, value]) => {
    let displayValue: string | number = value;
    if (key === "campusId") displayValue = campuses.find((campus) => campus.id === value)?.name || value;
    return `${FIELD_LABELS[key] || key}: ${displayValue}`;
  }).join(", ");
}

export function StaffProfileClient({
  staff,
  campuses,
  assignments,
  requests,
}: {
  staff: StaffProfile;
  campuses: { id: number; name: string }[];
  assignments: Assignment[];
  requests: ProfileRequest[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSendingRequest(true);
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};

    for (const key of ["firstName", "lastName", "email", "phone", "campusId", "reason"]) {
      const value = String(formData.get(key) || "").trim();
      if (value) payload[key] = value;
    }

    try {
      await api.post("/api/staff/profile-requests", payload);
      toast({ title: "Request sent", description: "Admin will review your profile correction request.", variant: "success" });
      event.currentTarget.reset();
      router.refresh();
    } catch (error: unknown) {
      toast({ title: "Could not send request", description: errorMessage(error), variant: "destructive" });
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handlePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsChangingPassword(true);
    const formData = new FormData(event.currentTarget);

    try {
      await api.post("/api/auth/change-password", {
        currentPassword: String(formData.get("currentPassword") || ""),
        newPassword: String(formData.get("newPassword") || ""),
      });
      toast({ title: "Password updated", description: "Use your new password next time you log in.", variant: "success" });
      event.currentTarget.reset();
    } catch (error: unknown) {
      toast({ title: "Could not update password", description: errorMessage(error), variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Profile & Settings</h1>
        <p className="text-stone-500 mt-1">View your staff record, request corrections, and update your password.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <ProfilePictureUploader 
            currentPictureUrl={staff.profilePictureUrl} 
            name={staff.firstName + " " + (staff.lastName || "")} 
            apiEndpoint="/api/staff/profile" 
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70"><CardTitle className="text-lg">Course streaming</CardTitle></CardHeader>
        <CardContent className="p-6 pt-7"><CourseStreamingSettings /></CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5 text-brand-700" />
                Staff Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-7">
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField label="First Name" value={staff.firstName} />
                <ReadOnlyField label="Last Name" value={staff.lastName || "-"} />
                <ReadOnlyField label="Email" value={staff.email} />
                <ReadOnlyField label="Phone" value={staff.phone || "Not added"} />
                <ReadOnlyField label="Campus" value={staff.campusName} />
                <ReadOnlyField label="Status" value={staff.isActive ? "Active" : "Disabled"} />
                <ReadOnlyField label="Joined" value={new Date(staff.joinedAt).toLocaleDateString()} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BriefcaseBusiness className="h-5 w-5 text-brand-700" />
                Teaching Assignments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <p className="p-6 text-sm text-stone-500">No timetable assignments yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {assignments.map((assignment) => (
                    <div key={assignment.id} className="grid gap-2 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <p className="font-semibold text-brand-950">{assignment.subject || "Subject"}</p>
                        <p className="text-sm text-stone-500">{formatClassSection(assignment.className, assignment.sectionName)}</p>
                      </div>
                      <p className="flex items-center gap-2 text-sm text-stone-600">
                        <CalendarClock className="h-4 w-4 text-stone-400" />
                        {DAYS[assignment.dayOfWeek]} {assignment.startTime.substring(0, 5)} - {assignment.endTime.substring(0, 5)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-brand-700" />
                Request Profile Correction
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-7">
              <form onSubmit={handleRequest} className="space-y-5 text-left">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="First Name">
                    <Input name="firstName" placeholder={staff.firstName} />
                  </Field>
                  <Field label="Last Name">
                    <Input name="lastName" placeholder={staff.lastName || "Last name"} />
                  </Field>
                  <Field label="Email">
                    <Input name="email" type="email" placeholder={staff.email} />
                  </Field>
                  <Field label="Phone">
                    <Input name="phone" placeholder={staff.phone || "Phone number"} />
                  </Field>
                  <Field label="Campus">
                    <select name="campusId" className="h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                      <option value="">No campus change</option>
                      {campuses.map((campus) => (
                        <option key={campus.id} value={campus.id}>{campus.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Reason">
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    rows={4}
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring"
                    placeholder="Explain what needs to be corrected and why."
                  />
                </Field>
                <Button type="submit" disabled={isSendingRequest} className="gap-2">
                  <Send className="h-4 w-4" />
                  {isSendingRequest ? "Sending..." : "Send Request"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-brand-700" />
                Request History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <p className="p-6 text-sm text-stone-500">No profile correction requests yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {requests.map((request) => (
                    <div key={request.id} className="p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-brand-950">
                            {formatRequestedFields(request.requestedFields, campuses)}
                          </p>
                          <p className="mt-1 text-sm text-stone-500">{request.reason}</p>
                          {request.adminNote && <p className="mt-2 text-sm text-stone-600">Admin note: {request.adminNote}</p>}
                        </div>
                        <StatusBadge status={request.status} />
                      </div>
                      <p className="mt-2 text-xs text-stone-400">{new Date(request.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="border-b border-border bg-stone-50/70">
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-brand-700" />
              Update Password
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-7">
            <form onSubmit={handlePassword} className="space-y-5 text-left">
              <Field label="Current Password">
                <Input name="currentPassword" type="password" required />
              </Field>
              <Field label="New Password">
                <Input name="newPassword" type="password" required minLength={8} />
              </Field>
              <Button type="submit" disabled={isChangingPassword} className="w-full">
                {isChangingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-stone-50/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-brand-950">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-left">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }: { status: ProfileRequest["status"] }) {
  const className = status === "APPROVED"
    ? "bg-success/15 text-emerald-700"
    : status === "REJECTED"
      ? "bg-danger/15 text-red-700"
      : "bg-warning/20 text-yellow-700";

  return <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{status}</span>;
}
