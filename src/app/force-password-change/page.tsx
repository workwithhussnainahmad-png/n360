"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { ShieldAlert } from "lucide-react";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";

export default function ForcePasswordChangePage() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const currentPassword = formData.get("currentPassword");
    const newPassword = formData.get("newPassword");

    try {
      const result = await api.post<{ role?: string }>("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });

      toast({ title: "Success", description: "Password updated. Please log in again.", variant: "success" });
      
      // Logout and redirect to login
      await api.post("/api/auth/logout", {});
      window.location.replace(result.role === "PARENT" ? "/parent-login" : "/login");
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicAccessShell
      title="Update your password"
      description="Your temporary password must be replaced before the workspace can be opened."
      eyebrow="Account security"
      compact
    >
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-sm bg-danger/10">
            <ShieldAlert className="h-5 w-5 text-danger" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">Current Password</label>
              <Input name="currentPassword" type="password" required />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-stone-700">New Password</label>
              <Input name="newPassword" type="password" required minLength={8} />
              <p className="text-xs text-stone-400">Must be at least 8 characters and not the default password.</p>
            </div>

            <Button type="submit" className="w-full mt-6" disabled={isLoading}>
              {isLoading ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </Card>
    </PublicAccessShell>
  );
}
