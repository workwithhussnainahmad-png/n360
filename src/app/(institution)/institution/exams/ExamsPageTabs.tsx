"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PublishTabContent } from "./PublishTabContent";

type ClassType = { id: number; name: string; level: number };
type SubjectType = { id: number; name: string; code: string | null };

export function ExamsPageTabs({
  timetable,
  classes,
  subjects,
}: {
  timetable: ReactNode;
  classes: ClassType[];
  subjects: SubjectType[];
}) {
  const [tab, setTab] = useState("timetable");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="timetable">Exam Timetable</TabsTrigger>
        <TabsTrigger value="publish">Publish Results</TabsTrigger>
      </TabsList>

      <TabsContent value="timetable" className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {timetable}
      </TabsContent>

      <TabsContent value="publish">
        <PublishTabContent active={tab === "publish"} classes={classes} subjects={subjects} />
      </TabsContent>
    </Tabs>
  );
}
