"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { createInstitutionAdminAction } from "@/app/actions/institution-actions";
import { ShieldCheck, Mail, Lock, UserCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function InstitutionAdminForm() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await createInstitutionAdminAction(formData);
      toast({
        title: "Admin created",
        description: "The new institution admin has been created successfully.",
        variant: "success",
      });
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-600" />
          Add New Admin
        </CardTitle>
        <CardDescription>
          Create an admin for your current campus. Maximum 2 admins per campus.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <div className="relative">
              <UserCircle className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
              <Input id="name" name="name" className="pl-10" placeholder="Admin Name" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
              <Input id="email" name="email" type="email" className="pl-10" placeholder="admin@example.com" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
              <Input id="password" name="password" type="password" className="pl-10" placeholder="••••••••" required minLength={8} />
            </div>
          </div>

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Creating..." : "Create Admin"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
