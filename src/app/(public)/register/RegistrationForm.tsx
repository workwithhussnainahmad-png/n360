"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { useToast } from "@/components/ui/toaster";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { pricingPlans, type PricingPlanId } from "@/lib/pricing";

const STEPS = ["Details", "Location", "Documents & Setup"];

export function RegistrationForm({ selectedPlan }: { selectedPlan?: PricingPlanId }) {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    mainCampusName: "",
    type: "",
    username: "",
    country: "",
    city: "",
    address: "",
    contactEmail: "",
    contactPhone: "",
    registrationNumber: "",
    pricingPlan: selectedPlan ?? "",
    adminPassword: "",
    // Mocked for UI phase (R2 uploads can be implemented fully later)
    logoKey: "mock-logo-key",
    proofDocumentKey: "mock-doc-key",
  });
  const [hasAgreed, setHasAgreed] = useState(false);

  const updateForm = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) {
      if (step === 0 && !formData.pricingPlan) {
        toast({
          title: "Pricing Plan Required",
          description: "Select a pricing plan before continuing.",
          variant: "destructive",
        });
        return;
      }
      nextStep();
      return;
    }

    if (!hasAgreed) {
      toast({
        title: "Agreement Required",
        description: "You must agree to the Nisaab360 Service Agreement to register.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/api/institution/register", formData);
      setIsSuccess(true);
    } catch (err: unknown) {
      toast({
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Please check your inputs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Card className="p-4 sm:p-8">
        <EmptyState 
          icon={CheckCircle2}
          title="Registration Submitted" 
          description="Your application is now pending verification. We will email you once it's approved."
        />
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-8 flex items-center justify-between overflow-hidden">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex items-center">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-sm font-semibold ${idx <= step ? 'bg-brand-950 text-brand-300' : 'bg-stone-100 text-stone-400'}`}>
              {idx + 1}
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`mx-2 h-px w-8 sm:w-24 ${idx < step ? 'bg-brand-700' : 'bg-stone-200'}`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {step === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-semibold text-lg">Institution Details</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium">Institution Name</label>
              <Input name="name" value={formData.name} onChange={updateForm} required />
            </div>
            <div className="space-y-1">
              <label htmlFor="mainCampusName" className="text-sm font-medium">Main Campus Name</label>
              <Input id="mainCampusName" name="mainCampusName" value={formData.mainCampusName} onChange={updateForm} required minLength={2} maxLength={255} placeholder="e.g. Main Campus" />
              <p className="text-xs text-stone-500">This account will manage your main campus.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Type</label>
              <Select onValueChange={(val) => setFormData(p => ({ ...p, type: val }))} value={formData.type} required>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCHOOL">School</SelectItem>
                  <SelectItem value="COLLEGE">College</SelectItem>
                  <SelectItem value="UNIVERSITY">University</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Platform Username (Subdomain)</label>
              <Input name="username" value={formData.username} onChange={updateForm} placeholder="e.g. alliedschool" required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Registration Number</label>
              <Input name="registrationNumber" value={formData.registrationNumber} onChange={updateForm} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Pricing Plan <span className="text-red-600" aria-hidden="true">*</span></label>
              <Select
                onValueChange={(val) =>
                  setFormData((previous) => ({ ...previous, pricingPlan: val as PricingPlanId }))
                }
                value={formData.pricingPlan}
                required
              >
                <SelectTrigger aria-label="Pricing plan"><SelectValue placeholder="Select a pricing plan" /></SelectTrigger>
                <SelectContent>
                  {pricingPlans.map((plan) => (
                    <SelectItem value={plan.id} key={plan.id}>
                      {plan.name} — {plan.audience}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.pricingPlan && (
                <p className="text-xs text-stone-500">
                  This plan will be included with your request and service agreement.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-semibold text-lg">Location & Contact</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Country</label>
                <Input name="country" value={formData.country} onChange={updateForm} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">City</label>
                <Input name="city" value={formData.city} onChange={updateForm} required />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Address</label>
              <Input name="address" value={formData.address} onChange={updateForm} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Contact Email</label>
                <Input type="email" name="contactEmail" value={formData.contactEmail} onChange={updateForm} required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Contact Phone</label>
                <Input name="contactPhone" value={formData.contactPhone} onChange={updateForm} required />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="font-semibold text-lg">Setup Admin Account</h3>
            <div className="space-y-1">
              <label className="text-sm font-medium">Admin Password</label>
              <Input type="password" name="adminPassword" value={formData.adminPassword} onChange={updateForm} required minLength={8} />
              <p className="text-xs text-stone-500">This will be used along with your contact email to login.</p>
            </div>
            
            <div className="pt-4 border-t border-stone-200">
              <label className="flex items-start gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500" 
                  checked={hasAgreed}
                  onChange={(e) => setHasAgreed(e.target.checked)}
                  required
                />
                <span className="text-sm text-stone-700">
                  I have read and agree to the{" "}
                  <a
                    href={
                      formData.pricingPlan
                        ? `/agreement-nisaab360?plan=${formData.pricingPlan.toLowerCase()}`
                        : "/agreement-nisaab360"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline font-medium"
                  >
                    Nisaab360 Service Agreement
                  </a>.
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={prevStep} disabled={step === 0}>
            Back
          </Button>
          <Button type="submit" disabled={isLoading}>
            {step === STEPS.length - 1 ? (isLoading ? "Submitting..." : "Submit Registration") : "Continue"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
