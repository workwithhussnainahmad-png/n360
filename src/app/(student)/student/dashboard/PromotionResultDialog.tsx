"use client";

import { useEffect, useState } from "react";
import { Award, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

type PromotionStatus = "PROMOTED" | "RETAINED" | "GRADUATED";

type Promotion = {
  id: number;
  status: PromotionStatus;
};

/** Fetches the latest unseen promotion whenever the dashboard mounts. */
export function PromotionResultDialog() {
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let ignore = false;

    api
      .get<{ promotion: Promotion | null }>("/api/student/promotion-result")
      .then((data) => {
        if (ignore || !data.promotion) return;
        const storageKey = `promotion-result-seen:${data.promotion.id}`;
        if (window.localStorage.getItem(storageKey)) return;
        setPromotion(data.promotion);
        setOpen(true);
      })
      .catch(() => {
        // Non-blocking UX — leave dialog closed on failure.
      });

    return () => {
      ignore = true;
    };
  }, []);

  if (!promotion) return null;

  const isRetained = promotion.status === "RETAINED";
  const isGraduated = promotion.status === "GRADUATED";
  const storageKey = `promotion-result-seen:${promotion.id}`;

  const close = () => {
    window.localStorage.setItem(storageKey, "1");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <div className={isRetained ? "bg-amber-50 p-6" : "bg-brand-50 p-6"}>
          <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${isRetained ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-800"}`}>
            {isRetained ? <RotateCcw className="h-6 w-6" /> : <Award className="h-6 w-6" />}
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {isRetained
                ? "Your promotion result is ready"
                : isGraduated
                  ? "Congratulations, you graduated"
                  : "Congratulations, you are promoted"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-6 text-stone-600">
              {isRetained
                ? "This result is not the end of your progress. Review your weak subjects, ask your teachers for help, and keep a steady study routine. You can come back stronger."
                : isGraduated
                  ? "Your hard work has brought you to this milestone. Keep your discipline, stay curious, and carry these habits into your next step."
                  : "Your hard work has paid off. Start the new class with discipline, revise your basics, and keep building on this momentum."}
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="p-4">
          <Button onClick={close} className="w-full sm:w-auto">Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
