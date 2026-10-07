"use client";

import { FormEvent, useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Provider = "BUNNY" | "MUX";
type StreamingState = {
  scope: "INSTITUTION" | "STAFF";
  provider: Provider | null;
  configured: boolean;
  institutionOverride?: { provider: Provider; configured: boolean } | null;
};

const field =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function CourseStreamingSettings() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("BUNNY");
  const [state, setState] = useState<StreamingState | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/course-streaming", { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to load settings");
          setState(data);
          if (data.provider) setProvider(data.provider);
        })
        .catch((error) =>
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load streaming settings.",
          ),
        );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body =
      provider === "BUNNY"
        ? {
            provider,
            libraryId: form.get("libraryId"),
            apiKey: form.get("apiKey"),
            cdnHostname: form.get("cdnHostname"),
            tokenAuthKey: form.get("tokenAuthKey"),
          }
        : {
            provider,
            tokenId: form.get("tokenId"),
            tokenSecret: form.get("tokenSecret"),
          };
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/course-streaming", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save settings");
      setState((current) => ({
        scope: current?.scope || "INSTITUTION",
        provider,
        configured: true,
        institutionOverride: current?.institutionOverride,
      }));
      setMessage(
        state?.scope === "STAFF"
          ? "Your streaming credentials were saved securely."
          : "Streaming credentials saved securely. Courses are enabled.",
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save settings");
    } finally {
      setBusy(false);
    }
  }

  async function removeCredentials() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/course-streaming", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to remove streaming credentials");
      }
      setState((current) => ({
        scope: current?.scope || "INSTITUTION",
        provider: null,
        configured: false,
        institutionOverride: current?.institutionOverride,
      }));
      setConfirmRemove(false);
      setMessage(
        state?.scope === "STAFF"
          ? "Your personal streaming credentials were removed."
          : "Streaming credentials removed. Courses are now disabled.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove streaming credentials",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={save} className="mt-2 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-800 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-950">
                {state?.configured
                  ? `${state.provider === "MUX" ? "Mux" : "Bunny Stream"} connected`
                  : "Streaming is not configured"}
              </p>
              <p className="mt-1 max-w-xl text-xs leading-5 text-stone-500">
                {state?.scope === "STAFF"
                  ? "Remove your personal provider credentials without deleting any course records."
                  : "Removing institution credentials immediately disables Courses for teachers and students. Existing course records are preserved."}
              </p>
            </div>
          </div>
          {state?.configured && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove credentials
            </Button>
          )}
        </div>

        {state?.institutionOverride && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Institution {state.institutionOverride.provider} settings override
            your teacher settings.
          </p>
        )}

        <label className="block text-sm font-semibold text-stone-700">
          Streaming provider
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className={`${field} mt-1.5`}
          >
            <option value="BUNNY">Bunny Stream</option>
            <option value="MUX">Mux</option>
          </select>
        </label>

        {provider === "BUNNY" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-stone-700">
              Bunny Library ID
              <input required name="libraryId" className={`${field} mt-1.5`} />
            </label>
            <label className="block text-sm font-semibold text-stone-700">
              Bunny API key
              <input
                required
                type="password"
                name="apiKey"
                placeholder={state?.configured ? "Enter a new key to replace it" : "API key"}
                className={`${field} mt-1.5`}
              />
            </label>
            <label className="block text-sm font-semibold text-stone-700">
              Bunny CDN hostname
              <input required name="cdnHostname" placeholder="vz-xxxx.b-cdn.net" className={`${field} mt-1.5`} />
            </label>
            <label className="block text-sm font-semibold text-stone-700">
              CDN token authentication key
              <input required type="password" name="tokenAuthKey" placeholder="Library security token key" className={`${field} mt-1.5`} />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
              Use a Mux Access Token—not the Environment ID or Environment Key. The token needs Video Read/Write and System Write permissions so Nisaab360 can upload and protect lectures.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-stone-700">
                Mux Access Token ID
                <input required name="tokenId" className={`${field} mt-1.5`} />
              </label>
              <label className="block text-sm font-semibold text-stone-700">
                Mux Access Token Secret
                <input
                  required
                  type="password"
                  name="tokenSecret"
                  placeholder={state?.configured ? "Enter a new secret to replace it" : "Access token secret"}
                  className={`${field} mt-1.5`}
                />
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Save course streaming"}
          </Button>
          {message && <p className="text-sm text-stone-600">{message}</p>}
        </div>
      </form>

      <Dialog
        open={confirmRemove}
        onOpenChange={(open) => {
          if (!busy) setConfirmRemove(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove streaming credentials?</DialogTitle>
            <DialogDescription className="leading-6">
              {state?.scope === "STAFF"
                ? "Your personal Bunny or Mux credentials will be removed. Existing course and lecture records will not be deleted."
                : "Teachers and students will immediately lose access to Courses. Existing courses and lecture records will not be deleted."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void removeCredentials()}
            >
              {busy
                ? "Removing..."
                : state?.scope === "STAFF"
                  ? "Remove credentials"
                  : "Remove and disable Courses"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
