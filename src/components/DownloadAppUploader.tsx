"use client";

import { FormEvent, useState } from "react";
import { Download, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadAppUploader({
  type = "app",
  heading = "Mobile App Link",
}: {
  type?: "app" | "software";
  heading?: string;
}) {
  const [url, setUrl] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/download-${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Update failed.");
      setMessage(body.message || `${type === "app" ? "App" : "Software"} download link updated successfully.`);
      setUrl("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={saveLink} className="max-w-xl space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-brand-950">{heading}</h2>
        <p className="mt-1 text-sm text-stone-600">Enter a direct download link (e.g. from GitHub Releases).</p>
      </div>
      <input
        type="url"
        placeholder="https://github.com/..."
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="block w-full rounded-md border border-border bg-white p-2 text-sm"
        required
      />
      {message && <p className="text-sm font-medium text-success">{message}</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!url || isSaving}>
          <LinkIcon className="mr-2 h-4 w-4" />
          {isSaving ? "Saving…" : "Save link"}
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/download-${type}`}><Download className="mr-2 h-4 w-4" />Test download link</a>
        </Button>
      </div>
    </form>
  );
}
