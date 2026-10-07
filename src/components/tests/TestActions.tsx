"use client";

import { useState } from "react";
import { deleteOnlineTestAction, updateOnlineTestAction } from "@/app/actions/online-test-actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Edit2 } from "lucide-react";

export function TestActions({ testId, currentTitle, currentDurationMinutes }: { testId: number, currentTitle: string, currentDurationMinutes: number }) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMsg("");
    try {
      await deleteOnlineTestAction(testId);
      setIsDeleteDialogOpen(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to delete test");
      setIsDeleting(false);
    }
  };

  const handleUpdate = async (formData: FormData) => {
    setErrorMsg("");
    try {
      await updateOnlineTestAction(formData);
      setIsEditDialogOpen(false);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to update test");
    }
  };

  return (
    <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Title/Timer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Test Details</DialogTitle>
          </DialogHeader>
          <form action={handleUpdate} className="space-y-4 pt-4">
            <input type="hidden" name="testId" value={testId} />
            {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">Test Title</label>
                <input 
                  name="title" 
                  required 
                  defaultValue={currentTitle} 
                  className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm" 
                />
              </div>
              {currentDurationMinutes !== null && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">Duration (Minutes)</label>
                  <input 
                    name="durationMinutes" 
                    type="number" 
                    min="1" 
                    required 
                    defaultValue={currentDurationMinutes} 
                    className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm" 
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <SubmitButton>Save Changes</SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="text-danger hover:bg-danger/10 hover:text-danger">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Test
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Test</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-stone-600">
              Are you sure you want to delete this test? All student submissions and marks will be permanently lost. This action cannot be undone.
            </p>
            {errorMsg && <p className="text-sm text-danger">{errorMsg}</p>}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
              <Button type="button" variant="danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
