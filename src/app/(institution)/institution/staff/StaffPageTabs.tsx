"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffRequestsTabContent } from "./StaffRequestsTabContent";

export function StaffPageTabs({
  directory,
  campuses,
}: {
  directory: ReactNode;
  campuses: { id: number; name: string }[];
}) {
  const [tab, setTab] = useState("directory");

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="directory">Staff Directory</TabsTrigger>
        <TabsTrigger value="requests">Staff Requests</TabsTrigger>
      </TabsList>

      <TabsContent value="directory">
        {directory}
      </TabsContent>

      <TabsContent value="requests">
        <StaffRequestsTabContent active={tab === "requests"} campuses={campuses} />
      </TabsContent>
    </Tabs>
  );
}
