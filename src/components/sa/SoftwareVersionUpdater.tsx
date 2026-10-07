"use client";

import { useState } from "react";
import { updateSoftwareVersionAction } from "@/app/actions/sa-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";

export function SoftwareVersionUpdater({ currentVersion }: { currentVersion: string }) {
  const [version, setVersion] = useState(currentVersion);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  async function handleUpdate() {
    setIsPending(true);
    try {
      await updateSoftwareVersionAction(version);
      toast({ title: "Success", description: "Software version updated." });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update software version.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Software Version</CardTitle>
        <CardDescription>Set the latest version for the downloadable desktop software.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row">
        <Input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="e.g. 1.0.1" />
        <Button onClick={handleUpdate} disabled={isPending || version.trim() === currentVersion}>
          {isPending ? "Updating..." : "Update"}
        </Button>
      </CardContent>
    </Card>
  );
}
