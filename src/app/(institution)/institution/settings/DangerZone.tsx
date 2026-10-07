"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

export function DangerZone() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"warning" | "reason" | "deleting">("warning");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  const handleContinue = () => {
    setStep("reason");
  };

  const handleDelete = async () => {
    setErrorMsg("");
    setStep("deleting");

    try {
      const res = await fetch("/api/institution/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        throw new Error("Failed to delete account");
      }

      // Simulate a small delay for the animation
      await new Promise((resolve) => setTimeout(resolve, 3500));

      // After deletion, the backend destroys the session via cookies.
      // We will hit the logout endpoint just to be fully clean on the client side
      await fetch("/api/auth/logout", { method: "POST" });
      
      // Redirect to login
      window.location.replace("/login");
    } catch (err: any) {
      setStep("reason");
      setErrorMsg(err.message || "Failed to delete account. Please try again.");
    }
  };

  return (
    <>
      <Card className="border-red-200 bg-red-50/10">
        <CardHeader className="border-b border-red-100 bg-red-50/50">
          <CardTitle className="text-lg flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-stone-600 text-sm mb-4">
            Permanently delete your institution account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setIsOpen(true)}
            className="bg-red-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account
          </button>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (step !== "deleting") {
          setIsOpen(open);
          if (!open) {
            setTimeout(() => {
              setStep("warning");
              setReason("");
            }, 200);
          }
        }
      }}>
        <DialogContent className="sm:max-w-md">
          {step === "warning" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Institution Account
                </DialogTitle>
                <div className="pt-4 text-stone-700 space-y-2 text-sm">
                  <p><strong>Are you absolutely sure?</strong></p>
                  <p>This will <strong>instantly delete</strong> all data associated with your institution. There are no backups, and all records (staff, students, classes, results) will be permanently erased.</p>
                </div>
              </DialogHeader>
              <div className="mt-6 flex gap-2 sm:justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Yes, I understand
                </button>
              </div>
            </>
          )}

          {step === "reason" && (
            <>
              <DialogHeader>
                <DialogTitle>Why are you leaving?</DialogTitle>
                <div className="pt-2 text-sm text-stone-500">
                  Please let us know why you are deleting your account (optional). This helps us improve.
                </div>
              </DialogHeader>
              <div className="py-4 space-y-2">
                {errorMsg && (
                  <div className="p-3 bg-red-50 text-red-600 border border-red-200 rounded-md text-sm">
                    {errorMsg}
                  </div>
                )}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Your feedback..."
                  className="w-full h-24 p-3 border border-border rounded-md focus:ring-2 focus:ring-red-500 focus:outline-none resize-none text-sm"
                />
              </div>
              <div className="flex gap-2 sm:justify-end">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
                >
                  Permanently Delete
                </button>
              </div>
            </>
          )}

          {step === "deleting" && (
            <div className="py-6 sm:py-12 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-10 w-10 text-red-600 animate-spin" />
              <p className="text-lg font-medium text-stone-800 animate-pulse">Erasing all data...</p>
              <p className="text-sm text-stone-500">Please do not close this window.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
