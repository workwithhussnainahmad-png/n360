"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import type { ComponentProps } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentsClient } from "./StudentsClient";
import { StudentRequestsTabContent } from "./StudentRequestsTabContent";
import { displaySectionName } from "@/lib/class-section-label";
import styles from "./students-toolbar.module.css";

type StudentsClientProps = ComponentProps<typeof StudentsClient>;

export function StudentsPageTabs({
  students,
  classes,
  sections,
  totalCount,
  page,
  limit,
  filterClassId,
  filterSectionId,
  query,
}: {
  students: StudentsClientProps["students"];
  classes: StudentsClientProps["classes"];
  sections: StudentsClientProps["sections"];
  totalCount: number;
  page: number;
  limit: number;
  filterClassId: string;
  filterSectionId: string;
  query: string;
}) {
  const [tab, setTab] = useState("directory");
  const router = useRouter();
  function changeFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    if (key === 'classId') url.searchParams.delete('sectionId');
    url.searchParams.set('page', '1');
    router.push(url.pathname + url.search);
  }
  const filteredSections = sections.filter((section) => section.classId === Number(filterClassId));

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <div className={styles.toolbar}>
        <TabsList>
          <TabsTrigger value="directory">Student Directory</TabsTrigger>
          <TabsTrigger value="requests">Student Requests</TabsTrigger>
        </TabsList>
        {tab === "directory" && (
          <div className={styles.filters}>
            <label className={styles.filter}>
              <span>Class</span>
              <select
                className="focus-ring"
                value={filterClassId}
                onChange={(event) => changeFilter("classId", event.target.value)}
              >
                <option value="">All Classes</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className={styles.filter}>
              <span>Section</span>
              <select
                className="focus-ring"
                value={filterSectionId}
                onChange={(event) => changeFilter("sectionId", event.target.value)}
                disabled={!filterClassId}
              >
                <option value="">All Sections</option>
                {filteredSections.filter((section) => displaySectionName(section.name)).map((section) => (
                  <option key={section.id} value={section.id}>{displaySectionName(section.name)}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <TabsContent value="directory">
        <form className="flex gap-2 mb-4" action="/institution/students" method="get" onSubmit={event => { event.preventDefault(); changeFilter("q", String(new FormData(event.currentTarget).get("q") || "").trim()); }}>
          <input type="hidden" name="classId" value={filterClassId} /><input type="hidden" name="sectionId" value={filterSectionId} /><input type="hidden" name="limit" value={limit} />
          <Input key={query} name="q" defaultValue={query} maxLength={80} aria-label="Search all students" placeholder="Search all students by name or roll number" /><Button type="submit">Search</Button>
        </form>
        <StudentsClient
          students={students}
          classes={classes}
          sections={sections}
          totalCount={totalCount}
          page={page}
          limit={limit}
          filterClassId={filterClassId}
          filterSectionId={filterSectionId}
        />
      </TabsContent>

      <TabsContent value="requests">
        <StudentRequestsTabContent active={tab === "requests"} classes={classes} sections={sections} />
      </TabsContent>
    </Tabs>
  );
}
