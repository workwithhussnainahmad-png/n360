"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Copy } from "lucide-react";

export function ResetPasswordForm() {
  const [userType, setUserType] = useState<"STUDENT" | "STAFF">("STUDENT");
  const [identifier, setIdentifier] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successData, setSuccessData] = useState<{name: string, phone: string | null} | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) {
      setError(`Please enter the ${userType === "STUDENT" ? "Roll Number" : "Email"}`);
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessData(null);
    setCopied(false);

    try {
      const res = await fetch("/api/institution/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userType, identifier })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccessData({
        name: data.name,
        phone: data.phone
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const generateMessage = () => {
    if (!successData) return "";
    return `Dear ${successData.name},

Per your request, we have reset your account password. You can now login with the temporary password "1234567890".

For security reasons, please ensure you update it immediately upon logging in.

Regards,
Administration`;
  };

  const copyMessage = () => {
    navigator.clipboard.writeText(generateMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find User</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">User Type</label>
              <select
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent"
                value={userType}
                onChange={(e) => {
                  setUserType(e.target.value as "STUDENT" | "STAFF");
                  setIdentifier("");
                  setError("");
                  setSuccessData(null);
                }}
              >
                <option value="STUDENT">Student</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                {userType === "STUDENT" ? "Student Roll Number" : "Staff Email"}
              </label>
              <input
                type="text"
                placeholder={userType === "STUDENT" ? "e.g. 2026-1234" : "e.g. staff@school.edu"}
                className="w-full rounded-md border border-border px-3 py-2 text-sm bg-transparent"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            
            {error && (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 border border-amber-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" disabled={isLoading || !identifier}>
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {successData && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
              <div>
                <h3 className="font-bold text-green-900">Password Reset Successfully!</h3>
                <p className="text-sm text-green-700 mt-1">
                  The password for <strong>{successData.name}</strong> has been reset to <strong>1234567890</strong>.
                  {successData.phone ? ` You can send this message to their registered phone number: ${successData.phone}` : " (No phone number registered for this user)"}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-md border border-green-100 p-4 relative shadow-sm">
              <pre className="text-sm text-stone-700 whitespace-pre-wrap font-sans">
                {generateMessage()}
              </pre>
              <Button 
                variant="outline" 
                size="sm" 
                className="absolute top-3 right-3 bg-white"
                onClick={copyMessage}
              >
                <Copy className="h-4 w-4 mr-2" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
