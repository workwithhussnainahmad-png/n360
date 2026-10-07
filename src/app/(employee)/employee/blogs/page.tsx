import { Metadata } from "next";
import BlogClient from "../../../components/blogs/BlogClient";
import { db } from "@/db";
import { blogs } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { desc, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Manage Blogs | Employee",
};

const LIMIT = 4;

export default async function EmployeeBlogsPage() {
  const session = await getSession();
  if (!session || session.role !== "EMPLOYEE") redirect("/employee-login");

  const [paginatedBlogs, [{ totalCount }]] = await Promise.all([
    db.select().from(blogs).orderBy(desc(blogs.createdAt)).limit(LIMIT).offset(0),
    db.select({ totalCount: sql<number>`cast(count(${blogs.id}) as integer)` }).from(blogs),
  ]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold font-display text-stone-900 mb-6">Manage Blogs</h1>
      <BlogClient
        initialBlogs={paginatedBlogs}
        initialPage={1}
        initialTotalCount={totalCount}
        initialTotalPages={Math.max(1, Math.ceil(totalCount / LIMIT))}
      />
    </div>
  );
}
