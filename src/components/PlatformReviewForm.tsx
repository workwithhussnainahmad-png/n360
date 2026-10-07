"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Star } from "lucide-react";

export function PlatformReviewForm({
  defaultRating = 5,
  defaultContent = "",
  isUpdate = false,
}: {
  defaultRating?: number;
  defaultContent?: string;
  isUpdate?: boolean;
}) {
  const [rating, setRating] = useState(defaultRating);
  const [content, setContent] = useState(defaultContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.length < 10) {
      toast({ title: "Error", description: "Review must be at least 10 characters.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/me/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, content }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit review");
      }

      toast({ title: "Success", description: "Review submitted successfully!", variant: "success" });
      router.refresh(); // Refresh to update server components (moves it to settings or updates it)
    } catch (error) {
      toast({ title: "Error", description: "Could not submit review.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="p-1 focus:outline-none"
            >
              <Star
                className={`w-6 h-6 ${
                  star <= rating ? "fill-yellow-400 text-yellow-400" : "text-stone-300"
                } transition-colors`}
              />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Your Review</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tell us about your experience..."
          rows={4}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <p className="text-xs text-stone-500 mt-1">Minimum 10 characters.</p>
      </div>
      <Button type="submit" disabled={isSubmitting || content.length < 10} className="bg-brand-600 hover:bg-brand-700">
        {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        {isUpdate ? "Update Review" : "Submit Review"}
      </Button>
    </form>
  );
}
