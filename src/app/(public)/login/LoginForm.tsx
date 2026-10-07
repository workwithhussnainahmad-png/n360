"use client";

import { useState, type ComponentType, type FormEvent } from "react";
import { ArrowRight, Building2, GraduationCap, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { api } from "@/lib/api-client";
import { requiresPasswordChange } from "@/lib/auth-types";

type LoginMode = "STUDENT_STAFF" | "INSTITUTION" | "EMPLOYEE" | "PARENT";
type LoginIdentity = "STUDENT" | "STAFF";

type IdentityOption = {
  id: LoginIdentity;
  title: string;
  description: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  icon: ComponentType<{ className?: string }>;
};

type LoginFormProps = {
  mode?: LoginMode;
};

const identityOptions: IdentityOption[] = [
  {
    id: "STUDENT",
    title: "Student",
    description: "Use your roll number to view classes, attendance, marks, tests, and announcements.",
    identifierLabel: "Roll Number",
    identifierPlaceholder: "Enter your roll number",
    icon: GraduationCap,
  },
  {
    id: "STAFF",
    title: "Staff",
    description: "Use your staff email to manage attendance, tests, assignments, and classroom work.",
    identifierLabel: "Email",
    identifierPlaceholder: "Enter your staff email",
    icon: Users,
  },
];

const modeCopy = {
  STUDENT_STAFF: {
    eyebrow: "Student and Staff Login",
    title: "Access your learning workspace",
    description: "Students can sign in with roll number. Staff can sign in with their assigned email.",
    icon: Users,
    identifierLabel: "",
    identifierPlaceholder: "",
    footer: (
      <>
        <Link href="/institution-login" className="font-medium text-brand-900 hover:underline">
          Institution login
        </Link>
        <span className="text-stone-300">|</span>
        <Link href="/employee-login" className="font-medium text-brand-900 hover:underline">
          Employee login
        </Link>
        <span className="text-stone-300">|</span>
        <Link href="/parent-login" className="font-medium text-brand-900 hover:underline">
          Parent login
        </Link>
      </>
    ),
  },
  INSTITUTION: {
    eyebrow: "Institution Login",
    title: "Manage your institution",
    description: "For institution owners and administrators managing campuses, staff, students, and academics.",
    icon: Building2,
    identifierLabel: "Contact Email",
    identifierPlaceholder: "Enter your institution contact email",
    footer: (
      <>
        <span className="text-stone-500">Need access? </span>
        <Link href="/register" className="font-medium text-brand-900 hover:underline">
          Request registration
        </Link>
      </>
    ),
  },
  EMPLOYEE: {
    eyebrow: "Employee Login",
    title: "Open your operations dashboard",
    description: "For Nisaab360 employees handling platform operations and institution verification.",
    icon: UserCog,
    identifierLabel: "Email",
    identifierPlaceholder: "Enter your employee email",
    footer: (
      <Link href="/login" className="font-medium text-brand-900 hover:underline">
        Student or staff login
      </Link>
    ),
  },
  PARENT: {
    eyebrow: "Parent Login",
    title: "Follow every child from one account",
    description: "Use the institution username, guardian email, and password from your parent credentials email.",
    icon: Users,
    identifierLabel: "Guardian Email",
    identifierPlaceholder: "Enter your guardian email",
    footer: (
      <Link href="/login" className="font-medium text-brand-900 hover:underline">Student or staff login</Link>
    ),
  },
};

export function LoginForm({ mode = "STUDENT_STAFF" }: LoginFormProps) {
  const [selectedIdentity, setSelectedIdentity] = useState<LoginIdentity>("STUDENT");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const copy = modeCopy[mode];
  const selectedOption =
    mode === "STUDENT_STAFF"
      ? identityOptions.find((option) => option.id === selectedIdentity) ?? identityOptions[0]
      : null;
  const PortalIcon = selectedOption?.icon ?? copy.icon;
  const identifierLabel = selectedOption?.identifierLabel ?? copy.identifierLabel;
  const identifierPlaceholder = selectedOption?.identifierPlaceholder ?? copy.identifierPlaceholder;
  const roleHint = selectedOption?.id ?? (mode === "INSTITUTION" ? "INSTITUTION" : mode === "PARENT" ? "PARENT" : "EMPLOYEE");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const rawIdentifier = formData.get("emailOrUsername");
    const password = formData.get("password");
    const rawInstitutionUsername = formData.get("institutionUsername");
    const emailOrUsername = mode === "PARENT"
      ? String(rawIdentifier || "").trim().toLowerCase()
      : rawIdentifier;
    const institutionUsername = mode === "PARENT"
      ? String(rawInstitutionUsername || "").trim().toLowerCase()
      : rawInstitutionUsername;

    try {
      const res = await api.post<{ role: string; mustChangePassword: boolean }>("/api/auth/login", {
        emailOrUsername,
        password,
        roleHint,
        ...(mode === "PARENT" ? { institutionUsername } : {}),
      });

      toast({ title: "Success", description: "Logged in successfully", variant: "success" });

      if (requiresPasswordChange(res.role, res.mustChangePassword)) {
        router.push("/force-password-change");
      } else {
        let targetRole = res.role.toLowerCase();
        if (targetRole === "super_admin") targetRole = "sa";
        if (targetRole === "institution_admin") targetRole = "institution";
        
        const isLocal = window.location.hostname.includes("localhost");
        window.location.href = isLocal
          ? `/${targetRole}/dashboard`
          : `https://${targetRole}.nisaab360.app/dashboard`;
      }
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-brand-950">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="border-b border-brand-800 bg-brand-950 p-5 text-white sm:p-7 lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col justify-between gap-8">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-sm bg-brand-300 text-brand-950">
                <PortalIcon className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">
                {copy.eyebrow}
              </p>
              <h2 className="mt-3 font-display text-xl font-semibold text-white sm:text-2xl">
                {copy.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/55">{copy.description}</p>
            </div>

            {mode === "STUDENT_STAFF" && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Select role</p>
                  <span className="text-[10px] font-semibold text-brand-300">Choose one</span>
                </div>
                <div className="grid gap-2">
                {identityOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedIdentity === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedIdentity(option.id)}
                      aria-pressed={isSelected}
                      className={`group flex items-start gap-3 rounded-sm border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-brand-300 bg-brand-300 text-brand-950"
                          : "border-white/12 bg-white/5 text-white hover:border-white/25 hover:bg-white/8"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${
                          isSelected ? "bg-brand-950 text-brand-300" : "bg-white/8 text-white/55 group-hover:text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className={`block text-sm font-semibold ${isSelected ? "text-brand-950" : "text-white"}`}>
                            {option.title}
                          </span>
                          {isSelected && (
                            <span className="rounded-sm bg-brand-950 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-300">
                              Active
                            </span>
                          )}
                        </span>
                        <span className={`mt-1 block text-xs leading-5 ${isSelected ? "text-brand-950/65" : "text-white/45"}`}>
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex h-full flex-col justify-between bg-surface p-5 sm:p-7 lg:p-8">
          <div>
            <div className="mb-6">
              <p className="text-sm font-medium text-stone-500">Continue as</p>
              <h3 className="mt-1 text-2xl font-display font-semibold text-brand-950">
                {selectedOption?.title ?? (mode === "INSTITUTION" ? "Institution" : mode === "PARENT" ? "Parent" : "Employee")}
              </h3>
            </div>

            <div className="space-y-4">
              {mode === "PARENT" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-stone-700">Institution Username</label>
                  <Input
                    name="institutionUsername"
                    placeholder="e.g. ncs"
                    autoComplete="organization"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={30}
                    required
                  />
                  <p className="text-xs leading-5 text-stone-500">This is the institution username shown in your parent credentials email.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">{identifierLabel}</label>
                <Input
                  name="emailOrUsername"
                  type={mode === "PARENT" ? "email" : "text"}
                  placeholder={identifierPlaceholder}
                  autoComplete={selectedIdentity === "STUDENT" && mode === "STUDENT_STAFF" ? "username" : "email"}
                  autoCapitalize={mode === "PARENT" ? "none" : undefined}
                  spellCheck={mode === "PARENT" ? false : undefined}
                  maxLength={255}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-stone-700">Password</label>
                <Input
                  name="password"
                  type="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  maxLength={1024}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="mt-6 w-full" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
              {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
            {copy.footer}
          </div>

          <p className="mt-8 border-t border-border pt-4 text-center text-[10px] font-bold uppercase tracking-[0.13em] text-stone-400">
            Credentials are issued and managed by your institution
          </p>
        </form>
      </div>
    </Card>
  );
}
