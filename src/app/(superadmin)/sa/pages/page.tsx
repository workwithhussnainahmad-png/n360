import { Metadata } from "next";
import PagesClient from "./PagesClient";
import { db } from "@/db";
import { platformPages } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Manage Static Pages | Super Admin",
};

export default async function PagesManagementPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");

  const pages = await db
    .select({
      id: platformPages.id,
      slug: platformPages.slug,
      title: platformPages.title,
      content: platformPages.content,
      lastEditedAt: platformPages.lastEditedAt,
    })
    .from(platformPages)
    .orderBy(platformPages.title);

  return (
    <div className="p-6">

      <PagesClient
        role="SUPER_ADMIN"
        initialPages={pages.map((p) => ({
          ...p,
          lastEditedAt: p.lastEditedAt?.toISOString(),
        }))}
      />
    </div>
  );
}
