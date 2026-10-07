import { db } from "@/db";
import { classes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import DiaryMonitorClient from "./DiaryMonitorClient";

export default async function InstitutionDiaryPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }
  
  const institutionId = session.institutionId || session.userId;

  const allClasses = await db.select()
    .from(classes)
    .where(eq(classes.institutionId, institutionId))
    .orderBy(desc(classes.createdAt));

  return <DiaryMonitorClient classes={allClasses} />;
}
