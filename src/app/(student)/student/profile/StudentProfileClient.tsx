"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { BookOpen, CheckCircle2, KeyRound, Send, UserRound } from "lucide-react";
import { ProfilePictureUploader } from "@/components/ProfilePictureUploader";
import { displaySectionName } from "@/lib/class-section-label";

type ProfileRequest = {
  id: number;
  requestedFields: Record<string, string | number>;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
};

type StudentProfile = {
  id: number;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  phone: string | null;
  loginRollNumber: string;
  classRollNumber: string;
  academicStatus: "ACTIVE" | "GRADUATED";
  age?: number | null;
  profilePictureUrl?: string | null;
  emergencyContact?: string | null;
  parentalWhatsapp?: string | null;
  classId: number | null;
  sectionId: number | null;
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

function formatRequestedFields(fields: Record<string, string | number>, classes: { id: number; name: string }[], sections: { id: number; name: string }[]) {
  return Object.entries(fields).map(([key, value]) => {
    let displayValue: string | number = value;
    if (key === "classId") displayValue = classes.find((row) => row.id === value)?.name || value;
    if (key === "sectionId") displayValue = sections.find((row) => row.id === value)?.name || value;
    return `${FIELD_LABELS[key] || key}: ${displayValue}`;
  }).join(", ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function StudentProfileClient({
  student,
  classes,
  sections,
  requests,
}: {
  student: StudentProfile;
  classes: { id: number; name: string }[];
  sections: { id: number; name: string; classId: number }[];
  requests: ProfileRequest[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isGraduated = student.academicStatus === "GRADUATED";
  const [isSavingFatherName, setIsSavingFatherName] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [requestClassId, setRequestClassId] = useState("");

  const filteredSections = useMemo(() => {
    return requestClassId ? sections.filter((section) => section.classId === Number(requestClassId)) : sections;
  }, [requestClassId, sections]);

  const handleContactInfo = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSavingFatherName(true);
    const formData = new FormData(event.currentTarget);

    try {
      await api.patch("/api/student/profile", {
        fatherName: String(formData.get("fatherName") || ""),
        emergencyContact: String(formData.get("emergencyContact") || ""),
        parentalWhatsapp: String(formData.get("parentalWhatsapp") || ""),
        age: formData.get("age") ? Number(formData.get("age")) : undefined,
      });
      toast({ title: "Profile updated", description: "Contact info saved successfully.", variant: "success" });
      router.refresh();
    } catch (error: unknown) {
      toast({ title: "Could not save", description: errorMessage(error), variant: "destructive" });
    } finally {
      setIsSavingFatherName(false);
    }
  };

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSendingRequest(true);
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};

    for (const key of ["firstName", "lastName", "fatherName", "classId", "sectionId", "reason"]) {
      const value = String(formData.get(key) || "").trim();
      if (value) payload[key] = value;
    }

    try {
      await api.post("/api/student/profile-requests", payload);
      toast({ title: "Request sent", description: "Admin will review your profile correction request.", variant: "success" });
      event.currentTarget.reset();
      setRequestClassId("");
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
        <p className="text-stone-500 mt-1">
          {isGraduated
            ? "View your archived student record. Profile changes are closed after graduation."
            : "View your student record, request corrections, and update your password."}
        </p>
      </div>

      {!isGraduated && (
        <Card>
          <CardContent className="p-6">
            <ProfilePictureUploader
              currentPictureUrl={student.profilePictureUrl}
              name={student.firstName + " " + (student.lastName || "")}
              apiEndpoint="/api/student/profile"
            />
          </CardContent>
        </Card>
      )}

      <div className={isGraduated ? "space-y-6" : "grid gap-6 lg:grid-cols-[1fr_380px]"}>
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5 text-brand-700" />
                Student Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-7">
              <div className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField label="First Name" value={student.firstName} />
                <ReadOnlyField label="Last Name" value={student.lastName || "-"} />
                <ReadOnlyField label="Age" value={student.age ? String(student.age) : "Not added"} />
                <ReadOnlyField label="Emergency Contact" value={student.emergencyContact || "Not added"} />
                <ReadOnlyField label="Parental Whatsapp" value={student.parentalWhatsapp || "Not added"} />
                <ReadOnlyField label="Roll Number" value={student.academicStatus === "GRADUATED" ? "Graduated" : student.classRollNumber} />
                <ReadOnlyField label="Login ID" value={student.loginRollNumber} />
                <ReadOnlyField label="Academic Status" value={student.academicStatus === "GRADUATED" ? "Graduated" : "Active"} />
                <ReadOnlyField label="Class" value={student.className} />
                {displaySectionName(student.sectionName) && (
                  <ReadOnlyField label="Section" value={displaySectionName(student.sectionName)} />
                )}
                <ReadOnlyField label="Father Name" value={student.fatherName || "Not added"} />
              </div>
            </CardContent>
          </Card>

          {!isGraduated && (
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
                      <Input name="firstName" placeholder={student.firstName} />
                    </Field>
                    <Field label="Last Name">
                      <Input name="lastName" placeholder={student.lastName || "Last name"} />
                    </Field>
                    <Field label="Father Name">
                      <Input name="fatherName" placeholder={student.fatherName || "Father name"} />
                    </Field>
                    <Field label="Class">
                      <select
                        name="classId"
                        className="h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus-ring"
                        value={requestClassId}
                        onChange={(event) => setRequestClassId(event.target.value)}
                      >
                        <option value="">No class change</option>
                        {classes.map((classRow) => (
                          <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Section">
                      <select name="sectionId" className="h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring">
                        <option value="">No section change</option>
                        {filteredSections.filter((section) => displaySectionName(section.name)).map((section) => (
                          <option key={section.id} value={section.id}>{displaySectionName(section.name)}</option>
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
          )}

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-brand-700" />
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
                            {formatRequestedFields(request.requestedFields, classes, sections)}
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

        {!isGraduated && <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle2 className="h-5 w-5 text-brand-700" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-7">
              <form onSubmit={handleContactInfo} className="space-y-5 text-left">
                <Field label="Father Name">
                  <Input name="fatherName" defaultValue={student.fatherName || ""} required />
                </Field>
                <Field label="Age">
                  <Input name="age" type="number" defaultValue={student.age || ""} placeholder="E.g. 18" />
                </Field>
                <Field label="Emergency Contact">
                  <Input name="emergencyContact" defaultValue={student.emergencyContact || ""} placeholder="E.g. +1234567890" />
                </Field>
                <Field label="Parental Whatsapp (or Elder Sibling)">
                  <Input name="parentalWhatsapp" defaultValue={student.parentalWhatsapp || ""} placeholder="E.g. +1234567890" />
                </Field>
                <Button type="submit" disabled={isSavingFatherName} className="w-full">
                  {isSavingFatherName ? "Saving..." : "Save Contact Info"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
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
        </div>}
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

  return (
    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}
