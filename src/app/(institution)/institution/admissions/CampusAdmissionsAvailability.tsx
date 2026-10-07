"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CampusIntake = {
  campus: { id: number; name: string } | null;
  cycles: Array<{ id: number; name: string; academicYear: string; isOpen: boolean; cycleAccepting: boolean }>;
};

export function CampusAdmissionsAvailability({ refreshKey }: { refreshKey: string }) {
  const [data, setData] = useState<CampusIntake | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/institution/admissions/campuses", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load campus admissions");
    return result as CampusIntake;
  }, []);
  useEffect(() => {
    let active = true;
    load().then(result => { if (active) setData(result); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [load, refreshKey]);

  async function change(cycleId: number, isOpen: boolean) {
    setBusy(cycleId);
    setError("");
    try {
      const response = await fetch("/api/institution/admissions/campuses", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycleId, isOpen }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update campus admissions");
      setData(await load());
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to update campus admissions"); }
    finally { setBusy(null); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Campus admissions{data?.campus ? ` — ${data.campus.name}` : ""}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-stone-600">Choose which cycles accept new applications for this campus. Closing intake keeps existing applications available for review and enrollment.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-stone-500">Loading campus admissions…</p>}
        {data?.cycles.length === 0 && <p className="text-sm text-stone-500">No admission cycles available for this campus.</p>}
        {data?.cycles.map(cycle => (
          <div key={cycle.id} className="flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{cycle.name} <span className="text-sm font-normal text-stone-500">{cycle.academicYear}</span></p>
              <p className="mt-1 text-sm text-stone-600">{cycle.isOpen && cycle.cycleAccepting ? "Accepting applications" : "Not accepting applications"}</p>
              {!cycle.cycleAccepting && <p className="mt-1 text-xs text-stone-500">The main cycle must be open and within its admission dates.{cycle.isOpen ? " This campus is ready when the cycle opens." : ""}</p>}
            </div>
            <Button type="button" variant={cycle.isOpen ? "outline" : "default"} disabled={busy !== null} onClick={() => change(cycle.id, !cycle.isOpen)}>
              {busy === cycle.id ? "Saving…" : cycle.isOpen ? "Close campus admissions" : "Open campus admissions"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
