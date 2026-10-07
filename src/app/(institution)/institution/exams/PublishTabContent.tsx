"use client";

import { useEffect, useState } from "react";
import { PublishResultsForm } from "@/components/institution/PublishResultsForm";

type ClassType = { id: number; name: string; level: number };
type SectionType = { id: number; classId: number; name: string };
type SubjectType = { id: number; name: string; code: string | null };

function PublishFormSkeleton() {
  return (
    <div className="max-w-4xl space-y-4 rounded-lg border border-border p-6">
      <div className="h-6 w-48 animate-pulse rounded-md bg-stone-100" />
      <div className="h-4 w-80 animate-pulse rounded-md bg-stone-100" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-md bg-stone-100" />
        ))}
      </div>
      <div className="h-24 w-full animate-pulse rounded-md bg-stone-100" />
    </div>
  );
}

export function PublishTabContent({
  active,
  classes,
  subjects,
}: {
  active: boolean;
  classes: ClassType[];
  subjects: SubjectType[];
}) {
  const [sections, setSections] = useState<SectionType[] | null>(null);

  useEffect(() => {
    if (!active || sections !== null) return;

    let ignore = false;

    fetch("/api/institution/sections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sections: SectionType[] } | null) => {
        if (!ignore) setSections(data?.sections ?? []);
      })
      .catch(() => {
        if (!ignore) setSections([]);
      });

    return () => {
      ignore = true;
    };
  }, [active, sections]);

  if (sections === null) {
    return <PublishFormSkeleton />;
  }

  return (
    <div className="max-w-4xl">
      <PublishResultsForm classes={classes} sections={sections} subjects={subjects} />
    </div>
  );
}
