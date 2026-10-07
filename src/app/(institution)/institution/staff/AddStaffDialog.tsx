"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { id: number; name: string };

export function AddStaffDialog({ campuses, roles, createStaff }: {
  campuses: Option[];
  roles: Option[];
  createStaff: (formData: FormData) => Promise<{ success: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    try {
      await createStaff(formData);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Staff account could not be created.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setError(""); }}>
      <DialogTrigger asChild>
        <Button disabled={roles.length === 0}><Plus className="mr-2 h-4 w-4" />Add staff</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b border-border bg-stone-50 px-6 py-5 pr-12 text-left">
          <DialogTitle className="text-xl text-brand-950">Add staff member</DialogTitle>
          <DialogDescription className="mt-1 leading-6">Create a staff account and assign its campus and role.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-5 p-6 pt-7">
          <div><label className="mb-2 block text-sm font-medium text-stone-700">Full name</label><input type="text" name="name" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Jane Smith" /></div>
          <div><label className="mb-2 block text-sm font-medium text-stone-700">Phone number</label><input type="text" name="phone" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="+92 300 1234567" /></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className="mb-2 block text-sm font-medium text-stone-700">Campus</label><select name="campusId" className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"><option value="">Main campus</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-medium text-stone-700">Staff role</label><select name="customRoleId" required className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
          </div>
          <div><label className="mb-2 block text-sm font-medium text-stone-700">Initial password</label><input type="password" name="password" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" /><p className="mt-2 text-xs leading-5 text-stone-500">A login email is generated automatically. The staff member must change this password after signing in.</p></div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>Create staff account</SubmitButton></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
