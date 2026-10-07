"use client";

import { useState } from "react";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function DeleteStaffButton({ staffId, staffName }: { staffId: number, staffName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleDelete = async () => {
    try {
      setLoading(true);
      await api.delete(`/api/institution/staff/${staffId}`);
      toast({ title: "Staff deleted", variant: "success" });
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast({ title: "Error deleting staff", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title="Delete Staff"
      >
        <Trash className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Staff</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to permanently delete <strong>{staffName}</strong>?</p>
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Yes, Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
