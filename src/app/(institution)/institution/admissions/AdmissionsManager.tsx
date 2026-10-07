"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Pencil,
  Plus,
  School,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CampusAdmissionsAvailability } from "./CampusAdmissionsAvailability";

type Cycle = {
  id: number;
  name: string;
  academicYear: string;
  opensOn: string | null;
  closesOn: string | null;
  instructions: string | null;
  requiredDocuments: Array<{ name: string; instructions: string | null }>;
  requiresTest: boolean;
  testScheduledAt: string | null;
  testLocation: string | null;
  testInstructions: string | null;
  requiresInterview: boolean;
  interviewScheduledAt: string | null;
  interviewLocation: string | null;
  interviewInstructions: string | null;
  admissionFeeAmount: number | null;
  admissionFeeDueDays: number;
  admissionFeeInstructions: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED";
};

type Offering = {
  id: number;
  cycleId: number;
  title: string;
  description: string | null;
  capacity: number | null;
  isActive: boolean;
};

const cycleStatusStyles: Record<Cycle["status"], string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  OPEN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CLOSED: "border-stone-200 bg-stone-100 text-stone-600",
};

function formatAdmissionDate(value: string | null, fallback: string) {
  if (!value) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AdmissionsManager({
  mode = "setup",
}: {
  mode?: "setup" | "status";
}) {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [cyclePendingRemoval, setCyclePendingRemoval] = useState<Cycle | null>(null);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [offeringPendingRemoval, setOfferingPendingRemoval] = useState<Offering | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/institution/admissions", {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load admissions");
    setCycles(data.cycles);
    setOfferings(data.offerings);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load()
        .catch((error) => setMessage({ kind: "error", text: error.message }))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function send(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/institution/admissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to update admissions");
      await load();
      setMessage({ kind: "success", text: "Admissions settings updated." });
      return true;
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update admissions",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const documentInstructions = String(
      data.get("documentInstructions") || "",
    ).trim();
    const requiredDocuments = String(data.get("requiredDocuments") || "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, instructions: documentInstructions || null }));
    const toIsoDateTime = (name: string) => {
      const value = String(data.get(name) || "").trim();
      return value ? new Date(value).toISOString() : "";
    };
    const saved = await send({
      action: "createCycle",
      name: data.get("name"),
      academicYear: data.get("academicYear"),
      opensOn: data.get("opensOn"),
      closesOn: data.get("closesOn"),
      instructions: data.get("instructions"),
      requiredDocuments,
      requiresTest: data.get("requiresTest") === "on",
      testScheduledAt: toIsoDateTime("testScheduledAt"),
      testLocation: data.get("testLocation"),
      testInstructions: data.get("testInstructions"),
      requiresInterview: data.get("requiresInterview") === "on",
      interviewScheduledAt: toIsoDateTime("interviewScheduledAt"),
      interviewLocation: data.get("interviewLocation"),
      interviewInstructions: data.get("interviewInstructions"),
      admissionFeeAmount: Number(data.get("admissionFeeAmount")),
      admissionFeeDueDays: Number(data.get("admissionFeeDueDays")),
      admissionFeeInstructions: data.get("admissionFeeInstructions"),
    });
    if (saved) {
      form.reset();
    }
  }

  function beginEditingCycle(cycle: Cycle) {
    setEditingCycle(cycle);
  }

  async function updateCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCycle || editingCycle.status === "OPEN") return;
    const data = new FormData(event.currentTarget);
    const documentInstructions = String(data.get("documentInstructions") || "").trim();
    const requiredDocuments = String(data.get("requiredDocuments") || "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, instructions: documentInstructions || null }));
    const toIsoDateTime = (name: string) => {
      const value = String(data.get(name) || "").trim();
      return value ? new Date(value).toISOString() : "";
    };
    const saved = await send({
      action: "updateCycle",
      cycleId: editingCycle.id,
      name: data.get("name"),
      academicYear: data.get("academicYear"),
      opensOn: data.get("opensOn"),
      closesOn: data.get("closesOn"),
      instructions: data.get("instructions"),
      requiredDocuments,
      requiresTest: data.get("requiresTest") === "on",
      testScheduledAt: toIsoDateTime("testScheduledAt"),
      testLocation: data.get("testLocation"),
      testInstructions: data.get("testInstructions"),
      requiresInterview: data.get("requiresInterview") === "on",
      interviewScheduledAt: toIsoDateTime("interviewScheduledAt"),
      interviewLocation: data.get("interviewLocation"),
      interviewInstructions: data.get("interviewInstructions"),
      admissionFeeAmount: Number(data.get("admissionFeeAmount")),
      admissionFeeDueDays: Number(data.get("admissionFeeDueDays")),
      admissionFeeInstructions: data.get("admissionFeeInstructions"),
    });
    if (saved) {
      setEditingCycle(null);
    }
  }

  async function createOffering(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    if (!title) {
      setMessage({ kind: "error", text: "Enter a program or class name." });
      form.querySelector<HTMLInputElement>('[name="title"]')?.focus();
      return;
    }
    const capacity = String(data.get("capacity") || "").trim();
    const saved = await send({
      action: "createOffering",
      cycleId: Number(data.get("cycleId")),
      title,
      description: String(data.get("description") || "").trim(),
      capacity: capacity ? Number(capacity) : null,
    });
    if (saved) form.reset();
  }

  async function updateOffering(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOffering) return;
    const data = new FormData(event.currentTarget);
    const capacity = String(data.get("capacity") || "").trim();
    if (
      await send({
        action: "updateOffering",
        offeringId: editingOffering.id,
        title: data.get("title"),
        description: String(data.get("description") || "").trim(),
        capacity: capacity ? Number(capacity) : null,
      })
    ) {
      setEditingOffering(null);
    }
  }

  if (loading)
    return <p className="text-sm text-stone-500">Loading admissions...</p>;

  return (
    <div className="space-y-6">
      {message && (
        <p
          id="admissions-status-message"
          role="status"
          className={`rounded-md px-4 py-3 text-sm ${message.kind === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
        >
          {message.text}
        </p>
      )}

      {mode === "setup" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-brand-600" />
                New admission cycle
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={createCycle} className="space-y-6 pt-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-stone-700">
                    Cycle name
                    <input
                      name="name"
                      required
                      maxLength={120}
                      placeholder="Fall Admissions 2027"
                      className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="block text-sm font-medium text-stone-700">
                    Academic year
                    <input
                      name="academicYear"
                      required
                      maxLength={20}
                      placeholder="2027-2028"
                      className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Opening date
                    <input
                      name="opensOn"
                      type="date"
                      className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Closing date
                    <input
                      name="closesOn"
                      type="date"
                      className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-stone-700">
                  Applicant instructions
                  <textarea
                    name="instructions"
                    maxLength={3000}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                    placeholder="General information shown before an applicant submits the form"
                  />
                </label>

                <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-5">
                  <h3 className="font-semibold text-stone-900">
                    Required documents
                  </h3>
                  <p className="mt-1 text-xs text-stone-500">
                    These requests are created automatically when staff accepts
                    an application.
                  </p>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <label className="text-sm font-medium text-stone-700">
                      Document names — one per line
                      <textarea
                        required
                        name="requiredDocuments"
                        maxLength={2000}
                        rows={4}
                        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal"
                        placeholder={
                          "B-Form\nPrevious result card\nPassport-size photographs"
                        }
                      />
                    </label>
                    <label className="text-sm font-medium text-stone-700">
                      Online upload instructions (optional)
                      <textarea
                        name="documentInstructions"
                        maxLength={500}
                        rows={4}
                        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal"
                        placeholder="Shown in the applicant portal, for example: upload one clear PDF or image."
                      />
                    </label>
                  </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-xl border border-stone-200 p-5">
                    <label className="flex items-center gap-2 font-semibold text-stone-900">
                      <input name="requiresTest" type="checkbox" />
                      Admission test required
                    </label>
                    <p className="mt-1 text-xs text-stone-500">
                      The preset schedule is assigned after document
                      verification.
                    </p>
                    <div className="mt-4 space-y-3">
                      <input
                        name="testScheduledAt"
                        type="datetime-local"
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                      />
                      <input
                        name="testLocation"
                        maxLength={300}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        placeholder="Test campus, room, or address"
                      />
                      <textarea
                        name="testInstructions"
                        maxLength={1000}
                        rows={2}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        placeholder="Test instructions (optional)"
                      />
                    </div>
                  </section>
                  <section className="rounded-xl border border-stone-200 p-5">
                    <label className="flex items-center gap-2 font-semibold text-stone-900">
                      <input name="requiresInterview" type="checkbox" />
                      Interview required
                    </label>
                    <p className="mt-1 text-xs text-stone-500">
                      The preset interview is assigned only after a passed test,
                      when applicable.
                    </p>
                    <div className="mt-4 space-y-3">
                      <input
                        name="interviewScheduledAt"
                        type="datetime-local"
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                      />
                      <input
                        name="interviewLocation"
                        maxLength={300}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        placeholder="Interview campus, room, or address"
                      />
                      <textarea
                        name="interviewInstructions"
                        maxLength={1000}
                        rows={2}
                        className="w-full rounded-md border border-border px-3 py-2 text-sm"
                        placeholder="Interview instructions (optional)"
                      />
                    </div>
                  </section>
                </div>

                <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                  <h3 className="font-semibold text-emerald-950">
                    Admission fee preset
                  </h3>
                  <p className="mt-1 text-xs text-emerald-800">
                    The payment request is created automatically after the
                    applicant passes all required stages.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-stone-700">
                      Amount (PKR)
                      <input
                        required
                        name="admissionFeeAmount"
                        type="number"
                        min={1}
                        max={100000000}
                        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal"
                      />
                    </label>
                    <label className="text-sm font-medium text-stone-700">
                      Payment deadline after offer
                      <input
                        required
                        name="admissionFeeDueDays"
                        type="number"
                        min={1}
                        max={90}
                        defaultValue={7}
                        className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal"
                      />
                      <span className="mt-1 block text-xs font-normal text-stone-500">
                        Number of days
                      </span>
                    </label>
                  </div>
                  <p className="mt-4 text-sm text-emerald-900">
                    Applicants will see the online payment gateways enabled in{" "}
                    <Link href="/institution/settings" className="font-medium underline">Settings → Payment Gateways</Link>.
                  </p>
                  <label className="mt-4 block text-sm font-medium text-stone-700">
                    Additional payment note (optional)
                    <textarea
                      name="admissionFeeInstructions"
                      maxLength={1000}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal"
                      placeholder="Example: Include the applicant name in the payment reference."
                    />
                  </label>
                </section>
                <Button disabled={busy} type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  Create cycle
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <School className="h-5 w-5 text-brand-600" />
                Add program or class
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={createOffering} className="space-y-4 pt-2">
                <label className="block text-sm font-medium text-stone-700">
                  Admission cycle
                  <select
                    name="cycleId"
                    required
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                  >
                    <option value="">Select cycle</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-stone-700">
                  Program or class
                  <input
                    name="title"
                    required
                    minLength={1}
                    maxLength={120}
                    placeholder="Grade 6 or BS Computer Science"
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                  />
                </label>
                <label className="block text-sm font-medium text-stone-700">
                  Description
                  <input
                    name="description"
                    maxLength={500}
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                  />
                </label>
                <label className="block text-sm font-medium text-stone-700">
                  Available seats (optional)
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal"
                  />
                </label>
                <Button disabled={busy || cycles.length === 0} type="submit">
                  <Plus className="mr-2 h-4 w-4" />
                  Add offering
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {mode === "status" && (
        <div className="space-y-4">
          <CampusAdmissionsAvailability refreshKey={cycles.map(cycle => `${cycle.id}:${cycle.status}`).join(",")} />
          {cycles.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-stone-500">
                Create your first admission cycle above.
              </CardContent>
            </Card>
          )}
          {cycles.map((cycle) => {
            const cycleOfferings = offerings.filter(
              (offering) => offering.cycleId === cycle.id,
            );
            return (
              <Card
                key={cycle.id}
                className="overflow-hidden border-stone-200 shadow-sm"
              >
                <div className="relative overflow-hidden border-b border-brand-800 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 px-5 py-6 text-white sm:px-7">
                  <div className="absolute -right-14 -top-20 h-48 w-48 rounded-full bg-white/5" />
                  <div className="absolute -bottom-24 right-20 h-40 w-40 rounded-full bg-brand-400/10" />
                  <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 sm:flex">
                        <GraduationCap className="h-6 w-6 text-brand-100" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-2xl font-bold tracking-tight">
                            {cycle.name}
                          </h2>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${cycleStatusStyles[cycle.status]}`}
                          >
                            {cycle.status}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-brand-50/85">
                          <span className="font-semibold text-white">
                            Academic year {cycle.academicYear}
                          </span>
                          {(cycle.opensOn || cycle.closesOn) && (
                            <span className="flex items-center gap-2">
                              <CalendarRange className="h-4 w-4 text-brand-200" />
                              {formatAdmissionDate(cycle.opensOn, "Any date")} –{" "}
                              {formatAdmissionDate(
                                cycle.closesOn,
                                "No closing date",
                              )}
                            </span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-white/90">
                          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                            {cycle.requiredDocuments?.length || 0} required
                            documents
                          </span>
                          {cycle.requiresTest && (
                            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                              Preset admission test
                            </span>
                          )}
                          {cycle.requiresInterview && (
                            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                              Preset interview
                            </span>
                          )}
                          {cycle.admissionFeeAmount && (
                            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">
                              PKR{" "}
                              {cycle.admissionFeeAmount.toLocaleString("en-PK")}{" "}
                              fee
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {cycle.status !== "OPEN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                          disabled={busy}
                          onClick={() => beginEditingCycle(cycle)}
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                      )}
                      {cycle.status !== "OPEN" && (
                        <Button
                          size="sm"
                          className="border border-white/20 bg-white text-brand-950 shadow-sm hover:bg-brand-50"
                          disabled={busy || cycleOfferings.length === 0}
                          onClick={() =>
                            send({
                              action: "setCycleStatus",
                              cycleId: cycle.id,
                              status: "OPEN",
                            })
                          }
                        >
                          Open admissions
                        </Button>
                      )}
                      {cycle.status === "OPEN" && (
                        <Button
                          size="sm"
                          className="border border-white/25 bg-white/10 text-white hover:bg-white/20"
                          disabled={busy}
                          onClick={() =>
                            send({
                              action: "setCycleStatus",
                              cycleId: cycle.id,
                              status: "CLOSED",
                            })
                          }
                        >
                          Close admissions
                        </Button>
                      )}
                      {cycle.status !== "OPEN" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                          disabled={busy}
                          onClick={() => setCyclePendingRemoval(cycle)}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <CardContent className="bg-stone-50/60 p-5 sm:p-7">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        Programs and classes
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        Options available to applicants in this cycle
                      </p>
                    </div>
                    <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600 shadow-sm">
                      {cycleOfferings.length}{" "}
                      {cycleOfferings.length === 1 ? "offering" : "offerings"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {cycleOfferings.map((offering) => (
                      <div
                        key={offering.id}
                        className="group rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                            <School className="h-5 w-5" />
                          </div>
                          {!offering.isActive && (
                            <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                              Hidden
                            </span>
                          )}
                        </div>
                        <h3 className="mt-4 text-lg font-bold text-stone-900">
                          {offering.title}
                        </h3>
                        {offering.description && (
                          <p className="mt-1.5 min-h-5 text-sm leading-6 text-stone-600">
                            {offering.description}
                          </p>
                        )}
                        <div className="mt-5 border-t border-stone-100 pt-4">
                          <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600">
                            <UsersRound className="h-3.5 w-3.5" />
                            {offering.capacity !== null
                              ? `${offering.capacity} seats available`
                              : "Open capacity"}
                          </span>
                        </div>
                        {cycle.status !== "OPEN" && (
                          <div className="mt-4 flex gap-2 border-t border-stone-100 pt-4">
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingOffering(offering)}>
                              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setOfferingPendingRemoval(offering)}>
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {cycleOfferings.length === 0 && (
                      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center sm:col-span-2 lg:col-span-3">
                        <School className="mx-auto h-8 w-8 text-stone-300" />
                        <p className="mt-3 text-sm font-medium text-stone-600">
                          No programs or classes added yet.
                        </p>
                        <p className="mt-1 text-xs text-stone-400">
                          Use the form above to add the first offering.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog
        open={Boolean(editingOffering)}
        onOpenChange={(open) => {
          if (!open && !busy) setEditingOffering(null);
        }}
      >
        {editingOffering && (
          <DialogContent className="max-w-lg">
            <div>
              <h2 className="pr-8 text-lg font-semibold text-brand-950">Edit program or class</h2>
              <p className="mt-1 text-sm text-stone-500">The admission cycle must remain closed while this information is changed.</p>
            </div>
            <form onSubmit={updateOffering} className="space-y-4">
              <label className="block text-sm font-medium text-stone-700">Program or class<input name="title" required minLength={1} maxLength={120} defaultValue={editingOffering.title} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" /></label>
              <label className="block text-sm font-medium text-stone-700">Description<input name="description" maxLength={500} defaultValue={editingOffering.description || ""} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" /></label>
              <label className="block text-sm font-medium text-stone-700">Available seats (optional)<input name="capacity" type="number" min={1} defaultValue={editingOffering.capacity || ""} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" /></label>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditingOffering(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button></div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={Boolean(offeringPendingRemoval)}
        onOpenChange={(open) => {
          if (!open && !busy) setOfferingPendingRemoval(null);
        }}
      >
        <DialogContent className="max-w-md">
          <h2 className="pr-8 text-lg font-semibold text-brand-950">Remove program or class?</h2>
          <p className="text-sm leading-6 text-stone-600">{offeringPendingRemoval?.title} will be permanently removed. An offering with application records cannot be deleted.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOfferingPendingRemoval(null)}>Cancel</Button><Button type="button" variant="danger" disabled={busy || !offeringPendingRemoval} onClick={async () => { if (!offeringPendingRemoval) return; if (await send({ action: "deleteOffering", offeringId: offeringPendingRemoval.id })) setOfferingPendingRemoval(null); }}>{busy ? "Removing..." : "Remove"}</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(editingCycle)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditingCycle(null);
          }
        }}
      >
        {editingCycle && (
          <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:p-0">
            <div className="border-b border-stone-200 bg-stone-50 px-6 py-5 pr-12">
              <h2 className="text-xl font-semibold text-brand-950">
                Edit admission information
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                This cycle is {editingCycle.status.toLowerCase()}. Save the
                changes before opening admissions again.
              </p>
            </div>
            <form
              onSubmit={updateCycle}
              className="max-h-[78svh] space-y-6 overflow-y-auto p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-stone-700">
                  Cycle name
                  <input name="name" required maxLength={120} defaultValue={editingCycle.name} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-stone-700">
                  Academic year
                  <input name="academicYear" required maxLength={20} defaultValue={editingCycle.academicYear} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-stone-700">
                  Opening date
                  <input name="opensOn" type="date" defaultValue={editingCycle.opensOn || ""} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" />
                </label>
                <label className="text-sm font-medium text-stone-700">
                  Closing date
                  <input name="closesOn" type="date" defaultValue={editingCycle.closesOn || ""} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" />
                </label>
              </div>

              <label className="block text-sm font-medium text-stone-700">
                Applicant instructions
                <textarea name="instructions" maxLength={3000} rows={3} defaultValue={editingCycle.instructions || ""} className="mt-1 w-full rounded-md border border-border px-3 py-2 font-normal" />
              </label>

              <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-5">
                <h3 className="font-semibold text-stone-900">Required documents</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <label className="text-sm font-medium text-stone-700">
                    Document names — one per line
                    <textarea name="requiredDocuments" required maxLength={2000} rows={5} defaultValue={editingCycle.requiredDocuments.map((document) => document.name).join("\n")} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal" />
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Online upload instructions
                    <textarea name="documentInstructions" maxLength={500} rows={5} defaultValue={editingCycle.requiredDocuments.find((document) => document.instructions)?.instructions || ""} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal" />
                  </label>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-stone-200 p-5">
                  <label className="flex items-center gap-2 font-semibold text-stone-900"><input name="requiresTest" type="checkbox" defaultChecked={editingCycle.requiresTest} /> Admission test required</label>
                  <div className="mt-4 space-y-3">
                    <input name="testScheduledAt" type="datetime-local" defaultValue={formatDateTimeLocal(editingCycle.testScheduledAt)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                    <input name="testLocation" maxLength={300} defaultValue={editingCycle.testLocation || ""} placeholder="Test location" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                    <textarea name="testInstructions" maxLength={1000} rows={2} defaultValue={editingCycle.testInstructions || ""} placeholder="Test instructions" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                  </div>
                </section>
                <section className="rounded-xl border border-stone-200 p-5">
                  <label className="flex items-center gap-2 font-semibold text-stone-900"><input name="requiresInterview" type="checkbox" defaultChecked={editingCycle.requiresInterview} /> Interview required</label>
                  <div className="mt-4 space-y-3">
                    <input name="interviewScheduledAt" type="datetime-local" defaultValue={formatDateTimeLocal(editingCycle.interviewScheduledAt)} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                    <input name="interviewLocation" maxLength={300} defaultValue={editingCycle.interviewLocation || ""} placeholder="Interview location" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                    <textarea name="interviewInstructions" maxLength={1000} rows={2} defaultValue={editingCycle.interviewInstructions || ""} placeholder="Interview instructions" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                <h3 className="font-semibold text-emerald-950">Admission fee</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-stone-700">Amount (PKR)<input required name="admissionFeeAmount" type="number" min={1} max={100000000} defaultValue={editingCycle.admissionFeeAmount || ""} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal" /></label>
                  <label className="text-sm font-medium text-stone-700">Payment deadline (days)<input required name="admissionFeeDueDays" type="number" min={1} max={90} defaultValue={editingCycle.admissionFeeDueDays} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal" /></label>
                </div>
                <p className="mt-4 text-sm text-emerald-900">Online payment options come from <Link href="/institution/settings" className="font-medium underline">Settings → Payment Gateways</Link>.</p>
                <label className="mt-4 block text-sm font-medium text-stone-700">Additional payment note<textarea name="admissionFeeInstructions" maxLength={1000} rows={2} defaultValue={editingCycle.admissionFeeInstructions || ""} className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 font-normal" /></label>
              </section>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-stone-200 bg-white py-4">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingCycle(null)}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Save admission information"}</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog
        open={Boolean(cyclePendingRemoval)}
        onOpenChange={(open) => {
          if (!open && !busy) setCyclePendingRemoval(null);
        }}
      >
        <DialogContent className="max-w-md">
          <h2 className="pr-8 text-lg font-semibold text-brand-950">
            Remove closed admission cycle?
          </h2>
          <p className="text-sm leading-6 text-stone-600">
            {cyclePendingRemoval?.name} will be removed from Open / close. This is only allowed when it has no application records.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setCyclePendingRemoval(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy || !cyclePendingRemoval}
              onClick={async () => {
                if (!cyclePendingRemoval) return;
                if (await send({ action: "deleteCycle", cycleId: cyclePendingRemoval.id })) setCyclePendingRemoval(null);
              }}
            >
              Remove cycle
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
