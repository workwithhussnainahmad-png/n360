"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentsClient } from "./StudentsClient";
import { StudentRequestsTabContent } from "./StudentRequestsTabContent";

type StudentsClientProps = ComponentProps<typeof StudentsClient>;

export function StudentsPageTabs({
  students,
  classes,
  sections,
  totalCount,
  page,
  limit,
}: {
  students: StudentsClientProps["students"];
  classes: StudentsClientProps["classes"];
  sections: StudentsClientProps["sections"];
  totalCount: number;
  page: number;
  limit: number;
}) {
  const [tab, setTab] = useState("directory");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="directory">Student Directory</TabsTrigger>
        <TabsTrigger value="requests">Student Requests</TabsTrigger>
      </TabsList>

      <TabsContent value="directory">
        <StudentsClient
          students={students}
          classes={classes}
          sections={sections}
          totalCount={totalCount}
          page={page}
          limit={limit}
        />
      </TabsContent>

      <TabsContent value="requests">
        <StudentRequestsTabContent active={tab === "requests"} classes={classes} sections={sections} />
      </TabsContent>
    </Tabs>
  );
}
