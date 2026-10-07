"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { api } from "@/lib/api-client";

export default function SaLoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);

    try {
      await api.post("/api/auth/login", {
        emailOrUsername: formData.get("email"),
        password: formData.get("password"),
        roleHint: "SUPER_ADMIN",
        securityAnswer: formData.get("securityAnswer"),
      });

      toast({ title: "Authorized", description: "Welcome Super Admin", variant: "success" });

      const isLocal = window.location.hostname.includes("localhost");
      window.location.href = isLocal ? "/sa/dashboard" : "https://sa.nisaab360.app/dashboard";
    } catch (error: unknown) {
      toast({
        title: "Access Denied",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicAccessShell
      compact
      eyebrow="Restricted system access"
      title="Super admin"
      description="Authenticate with your administrator credentials and security answer."
    >
      <Card className="overflow-hidden">
        <div className="flex items-start gap-4 border-b border-border bg-brand-950 p-5 text-white sm:p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/5">
            <ShieldCheck className="h-5 w-5 text-brand-300" />
          </span>
          <div>
            <p className="text-sm font-semibold">Protected administration area</p>
            <p className="mt-1 text-xs leading-5 text-white/60">
              Access is limited to authorized platform operators.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-700" htmlFor="super-admin-email">Email</label>
              <Input id="super-admin-email" name="email" type="email" maxLength={255} placeholder="admin@domain.com" required />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-700" htmlFor="super-admin-password">Password</label>
              <Input id="super-admin-password" name="password" type="password" maxLength={1024} placeholder="Enter your password" required />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-stone-700" htmlFor="security-answer">
                Security question answer
              </label>
              <Input
                id="security-answer"
                name="securityAnswer"
                type="password"
                maxLength={255}
                placeholder="Enter your security answer"
                required
              />
            </div>

            <Button type="submit" className="mt-6 w-full" disabled={isLoading}>
              {isLoading ? "Authenticating..." : "Login"}
            </Button>
          </form>
        </div>
      </Card>
    </PublicAccessShell>
  );
}
