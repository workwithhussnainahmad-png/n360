"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Save } from "lucide-react";

// Dynamically import MDEditor because it relies on the browser environment
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

type PageData = {
  id?: number;
  slug: string;
  title: string;
  content: string;
  lastEditedAt?: string;
};

const DEFAULT_PAGES = [
  { slug: "about-us", title: "About Us" },
  { slug: "careers", title: "Careers" },
  { slug: "blog", title: "Blog" },
  { slug: "contact", title: "Contact" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "terms-of-service", title: "Terms of Service" },
  { slug: "security", title: "Security" },
  { slug: "gdpr", title: "GDPR" },
  { slug: "pricing", title: "Pricing" },
];

export default function PagesClient({
  role,
  initialPages,
}: {
  role?: string;
  initialPages?: PageData[];
}) {
  const availablePages = DEFAULT_PAGES.filter(p => p.slug !== "pricing" || role !== "EMPLOYEE");
  const seededFromServer = initialPages !== undefined;
  
  const [pages, setPages] = useState<PageData[]>(initialPages ?? []);
  const [selectedSlug, setSelectedSlug] = useState<string>(availablePages[0].slug);
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(!seededFromServer);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const currentDefaultPage = availablePages.find(p => p.slug === selectedSlug);

  useEffect(() => {
    if (seededFromServer) return;
    fetchPages();
  }, [seededFromServer]);

  useEffect(() => {
    // When selected page changes, update the content in the editor
    const page = pages.find((p) => p.slug === selectedSlug);
    if (page) {
      setContent(page.content);
    } else {
      setContent(`# ${currentDefaultPage?.title}\n\nAdd content here...`);
    }
  }, [selectedSlug, pages, currentDefaultPage]);

  const fetchPages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/pages");
      if (res.ok) {
        const data = await res.json();
        setPages(data);
      }
    } catch (error) {
      console.error("Failed to fetch pages", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedSlug,
          title: currentDefaultPage?.title || selectedSlug,
          content,
        }),
      });

      if (res.status === 423) {
        toast({
          title: "Page Locked",
          description: "This page was edited less than 5 minutes ago. Please wait.",
          variant: "destructive",
        });
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to save");
      }

      toast({
        title: "Success",
        description: "Page saved successfully.",
      });
      await fetchPages(); // refresh the list to get new timestamps
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save the page.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && pages.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-stone-700">Select Page:</label>
          <select
            className="w-48 bg-white border border-stone-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
          >
            {availablePages.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="bg-brand-600 hover:bg-brand-700">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Page
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden" data-color-mode="light">
        <MDEditor
          value={content}
          onChange={(val) => setContent(val || "")}
          height={500}
          className="border-none"
        />
      </div>
    </div>
  );
}
