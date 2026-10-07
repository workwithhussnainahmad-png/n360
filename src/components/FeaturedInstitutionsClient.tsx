"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Plus, Trash2, ImageUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { prepareContentUpload } from "@/lib/client-upload-file";

type FeaturedInst = {
  id: number;
  name: string;
  logoKey: string | null;
  createdAt: string;
};

export default function FeaturedInstitutionsClient({
  initialInstitutions,
}: {
  initialInstitutions: FeaturedInst[];
}) {
  const [institutions, setInstitutions] = useState<FeaturedInst[]>(initialInstitutions);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [logoKey, setLogoKey] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchInstitutions = async () => {
    try {
      const res = await fetch("/api/admin/featured-institutions");
      if (res.ok) {
        const data = await res.json();
        setInstitutions(data);
      }
    } catch (error) {
      console.error("Failed to fetch featured institutions", error);
    }
  };

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const preparedFile = await prepareContentUpload(file, { allowedKinds: ['image'], maximumBytes: 2 * 1024 * 1024 });

      const sigRes = await fetch("/api/upload/signature", { method: "POST" });
      const signaturePayload = await sigRes.json();
      
      if (!sigRes.ok || !signaturePayload.signature || !signaturePayload.folder) {
        throw new Error(signaturePayload.error || "Upload service is not configured");
      }

      const uploadData = new FormData();
      uploadData.append("file", preparedFile);
      uploadData.append("api_key", signaturePayload.apiKey);
      uploadData.append("timestamp", signaturePayload.timestamp.toString());
      uploadData.append("signature", signaturePayload.signature);
      uploadData.append("folder", signaturePayload.folder);
      uploadData.append("allowed_formats", signaturePayload.allowedFormats);

      const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${signaturePayload.cloudName}/image/upload`, {
        method: "POST",
        body: uploadData,
      });
      const uploadPayload = await cloudinaryResponse.json();
      
      if (!cloudinaryResponse.ok || !uploadPayload.public_id) {
        throw new Error(uploadPayload.error?.message || "Cloudinary rejected the picture upload");
      }
      const completionResponse = await fetch('/api/upload/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicId: uploadPayload.public_id, resourceType: uploadPayload.resource_type, imageOnly: true }) });
      const completed = await completionResponse.json();
      if (!completionResponse.ok) throw new Error(completed.error || 'Uploaded image could not be verified');
      setLogoKey(completed.url);
      toast({ title: "Image Uploaded", description: "Logo ready to save.", variant: "success" });
    } catch (error: unknown) {
      toast({
        title: "Could not upload",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/admin/featured-institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, logoKey: logoKey || undefined }),
      });

      if (!res.ok) throw new Error("Failed to add");
      
      toast({ title: "Success", description: "Added featured institution" });
      setName("");
      setLogoKey("");
      fetchInstitutions();
    } catch {
      toast({ title: "Error", description: "Failed to add", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/featured-institutions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      
      toast({ title: "Success", description: "Removed featured institution" });
      fetchInstitutions();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
        <h2 className="font-semibold text-stone-900 mb-4 text-lg">Add New Featured Institution</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-stone-700">Institution Name</label>
            <Input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="e.g. Stanford University" 
              required
            />
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-stone-700">Logo (Optional)</label>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleImageUpload(file);
                }}
              />
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage} className="gap-2 w-full justify-start text-stone-600 font-normal">
                {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                {isUploadingImage ? "Uploading..." : logoKey ? "Change Logo" : "Upload Image"}
              </Button>
              {logoKey && (
                <div className="h-10 w-10 shrink-0 rounded-md border border-stone-200 overflow-hidden bg-stone-50">
                  {/* Dynamic preview stays direct to avoid an image-proxy request. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoKey} alt="Logo preview" className="h-full w-full object-cover" />
                </div>
              )}
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting || !name.trim() || isUploadingImage} className="bg-brand-600 hover:bg-brand-700">
            {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-sm border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Institution</th>
              <th className="px-6 py-4">Logo</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {institutions.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-4 sm:py-8 text-center text-stone-500">No featured institutions added yet.</td>
              </tr>
            )}
            {institutions.map((inst) => (
              <tr key={inst.id} className="hover:bg-stone-50/50">
                <td className="px-6 py-4 font-medium text-stone-900">{inst.name}</td>
                <td className="px-6 py-4">
                  {inst.logoKey ? (
                    // Logos are external, user-managed URLs; direct rendering avoids added proxy burden.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inst.logoKey} alt={inst.name} className="h-8 w-auto object-contain max-w-[100px]" />
                  ) : (
                    <span className="text-stone-400 text-xs italic">No logo</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(inst.id)} className="text-danger hover:text-danger hover:bg-danger/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
