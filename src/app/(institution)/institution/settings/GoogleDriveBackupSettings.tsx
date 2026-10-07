"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { InstitutionRestoreRequests } from "@/components/InstitutionRestoreRequests";
import { useToast } from "@/components/ui/toaster";
import { Loader2, HardDrive, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type DriveStatus = {
  connected: boolean;
  passwordConfigured?: boolean;
  folderName?: string;
  backupFileName?: string;
  lastBackupAt?: string | null;
  lastBackupError?: string | null;
};

export function GoogleDriveBackupSettings() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showRestoreRequests, setShowRestoreRequests] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/institution/settings/google-drive");
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setStatus(data);
      if (!data.connected) setShowRestoreRequests(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load Google Drive connection status.",
        variant: "destructive",
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void fetchStatus(), 0);
    
    // Handle OAuth callback success
    if (searchParams.get("googleDrive") === "connected") {
      toast({
        title: "Google Drive Connected",
        description: "Your Google Drive account has been linked successfully.",
      });
      // Remove query param without full reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("googleDrive");
      window.history.replaceState({}, "", newUrl.toString());
    }
    return () => window.clearTimeout(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, toast]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/institution/settings/google-drive/connect");
      if (!res.ok) throw new Error("Failed to get authorization URL");
      const data = await res.json();
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Could not initiate Google Drive connection.",
        variant: "destructive",
      });
      setConnecting(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 14) {
      toast({
        title: "Invalid Password",
        description: "Backup password must be at least 14 characters.",
        variant: "destructive",
      });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords Mismatch",
        description: "The passwords you entered do not match.",
        variant: "destructive",
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/institution/settings/google-drive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      
      if (!res.ok) throw new Error("Failed to save password");
      
      toast({
        title: "Password Saved",
        description: "Backup password has been updated successfully.",
      });
      
      setPassword("");
      setConfirmPassword("");
      await fetchStatus();
    } catch {
      toast({
        title: "Error",
        description: "Could not save backup password.",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/institution/settings/google-drive", {
        method: "DELETE",
      });
      
      if (!res.ok) throw new Error("Failed to disconnect");
      
      toast({
        title: "Disconnected",
        description: "Google Drive has been disconnected.",
      });
      
      setShowDisconnectConfirm(false);
      await fetchStatus();
    } catch {
      toast({
        title: "Error",
        description: "Could not disconnect Google Drive.",
        variant: "destructive",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {status?.connected ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-900">Google Drive Connected</p>
              <p className="text-xs text-green-700 mt-1">Automatic nightly backups are enabled.</p>
            </div>
          </div>
          
          <div className="space-y-4 rounded-md border border-border p-4 bg-stone-50/50">
            <h4 className="text-sm font-semibold text-stone-900">Backup Details</h4>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-0">
                <span className="text-stone-500">Folder Path:</span>
                <span className="font-medium text-stone-900 break-words">{status.folderName ? `Nisaab360/${status.folderName}` : "N/A"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-0">
                <span className="text-stone-500">Backup File:</span>
                <span className="font-medium text-stone-900 break-words">{status.backupFileName || "N/A"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-0">
                <span className="text-stone-500">Last Backup:</span>
                <span className="font-medium text-stone-900 break-words">
                  {status.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString() : "Never"}
                </span>
              </div>
              {status.lastBackupError && (
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-0">
                  <span className="text-red-500">Last Error:</span>
                  <span className="text-red-600 break-words">{status.lastBackupError}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-2">
              The system updates the same ZIP file every night.
            </p>
          </div>

          {status.passwordConfigured ? (
            <div className="rounded-md bg-stone-50 p-4 border border-border">
              <p className="text-sm font-medium text-stone-900 mb-1">Backup Password Configured</p>
              <p className="text-sm text-stone-500">The backup encryption password is securely set and cannot be changed here for security reasons.</p>
            </div>
          ) : (
            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-stone-900 mb-1">Backup Password</h4>
                <p className="text-xs text-stone-500 mb-4">
                  Set a password to encrypt your backups.
                </p>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700" htmlFor="drive-password">
                    Password (min 14 chars)
                  </label>
                  <input
                    id="drive-password"
                    type="password"
                    required
                    minLength={14}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Enter backup password"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700" htmlFor="drive-confirm">
                    Confirm Password
                  </label>
                  <input
                    id="drive-confirm"
                    type="password"
                    required
                    minLength={14}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Confirm backup password"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                disabled={savingPassword || !password || !confirmPassword}
                className="inline-flex h-9 items-center justify-center rounded-sm bg-brand-800 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-900 disabled:opacity-50"
              >
                {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Backup Password
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
            <Dialog open={showRestoreRequests} onOpenChange={setShowRestoreRequests}>
              <DialogTrigger asChild>
                <button type="button" className="inline-flex min-h-9 items-center justify-center rounded-sm border border-brand-800 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-stone-50">
                  Institution restore requests
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader className="pr-6">
                  <DialogTitle>Institution restore requests</DialogTitle>
                  <DialogDescription>Submit a backup and review your institution&apos;s restore requests.</DialogDescription>
                </DialogHeader>
                {showRestoreRequests && <InstitutionRestoreRequests embedded />}
              </DialogContent>
            </Dialog>
            <button
              type="button"
              onClick={() => setShowDisconnectConfirm(true)}
              className="inline-flex h-9 items-center justify-center rounded-sm border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 hover:text-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Disconnect Google Drive
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-md border border-stone-200 bg-stone-50 p-4">
            <XCircle className="h-5 w-5 text-stone-400" />
            <div>
              <p className="text-sm font-medium text-stone-700">Google Drive Not Connected</p>
              <p className="text-xs text-stone-500 mt-1">Connect to enable automatic nightly backups.</p>
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-[#4285F4] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3367D6] disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            Connect Google Drive
          </button>
        </div>
      )}

      <Dialog open={showDisconnectConfirm} onOpenChange={setShowDisconnectConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Google Drive?</DialogTitle>
            <DialogDescription>
              This will stop all future automatic nightly backups. Your existing backup files in Google Drive will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setShowDisconnectConfirm(false)}
              disabled={disconnecting}
              className="inline-flex h-9 items-center justify-center rounded-sm border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex h-9 items-center justify-center rounded-sm bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Disconnect
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
