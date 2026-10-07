"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { createInstitutionOwnerAction } from "@/app/actions/institution-actions";
import { Building2, UserCircle, Phone, Mail } from "lucide-react";

export function OwnerOnboardingForm() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      await createInstitutionOwnerAction(formData);
      toast({
        title: "Welcome aboard!",
        description: "Your details have been saved successfully.",
      });
      // Force hard refresh to clear the onboarding view
      window.location.reload();
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Could not save owner details.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <div className="public-canvas flex min-h-[100svh] items-center justify-center p-4 sm:p-8">
      <div className="relative w-full max-w-3xl overflow-hidden border border-border bg-surface p-5 sm:p-8">
        <div className="absolute left-0 top-0 h-1 w-full bg-brand-300" />
        
        <div className="mb-8 mt-2 border-b border-border pb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-brand-200 bg-brand-50 text-brand-700">
            <Building2 className="h-7 w-7" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Institution setup</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">Welcome to Nisaab360</h1>
          <p className="text-stone-500 mt-2 text-sm">
            Please provide your details as the owner to set up your institution dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <UserCircle className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
                <Input id="name" name="name" className="pl-10" placeholder="John Doe" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <Select name="gender" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
                <Input id="email" name="email" type="email" className="pl-10" placeholder="john@example.com" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 h-5 w-5 text-stone-400" />
                <Input id="contactNumber" name="contactNumber" className="pl-10" placeholder="+1234567890" required />
              </div>
            </div>
          </div>

          <Button type="submit" className="mt-2 w-full sm:w-auto sm:min-w-56" disabled={loading}>
            {loading ? "Saving..." : "Continue to Dashboard"}
          </Button>
        </form>
      </div>
    </div>
  );
}
