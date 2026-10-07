"use client";

import { useState } from "react";
import { updateAppVersionAction } from "@/app/actions/sa-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";

export function MobileAppVersionUpdater({ currentVersion }: { currentVersion: string }) {
  const [version, setVersion] = useState(currentVersion);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const handleUpdate = async () => {
    setIsPending(true);
    try {
      await updateAppVersionAction(version);
      toast({
        title: "Success",
        description: "Mobile App Version updated.",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to update version.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mobile App Version</CardTitle>
        <CardDescription>Force mobile app updates based on version diff.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-4">
        <Input 
          value={version} 
          onChange={(e) => setVersion(e.target.value)} 
          placeholder="e.g. 1.0.1" 
        />
        <Button onClick={handleUpdate} disabled={isPending || version === currentVersion}>
          {isPending ? "Updating..." : "Update"}
        </Button>
      </CardContent>
    </Card>
  );
}
