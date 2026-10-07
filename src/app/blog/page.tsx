import { db } from "@/db";
import { blogs } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  title: "Blog | Nisaab360 LMS",
  description: "Read the latest news, updates, and articles about Nisaab360 LMS.",
};

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const resolvedParams = await searchParams;
  const page = parseInt(resolvedParams.page || "1", 10);
  const limit = 4;
  const offset = (page - 1) * limit;

  const [publishedBlogs, [{ totalCount }]] = await Promise.all([
    db.select()
      .from(blogs)
      .where(eq(blogs.status, 'PUBLISHED'))
      .orderBy(desc(blogs.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ totalCount: sql<number>`cast(count(${blogs.id}) as integer)` })
      .from(blogs)
      .where(eq(blogs.status, 'PUBLISHED'))
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="public-document flex min-h-screen flex-col selection:bg-brand-300 selection:text-brand-950">
      <PublicPageHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:px-6 md:py-20">
        <div className="mb-12 border-l-2 border-brand-300 pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Nisaab360 journal</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.05em] text-brand-950 md:text-6xl">
            Notes on better school operations.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-stone-600">Product updates, practical guidance, and stories from education teams.</p>
        </div>

        {publishedBlogs.length === 0 ? (
          <div className="border border-dashed border-border bg-surface py-20 text-center">
            <p className="text-stone-500">No blog posts found. Check back later!</p>
          </div>
        ) : (
          <>
            <div className="mb-12 grid grid-cols-1 border-l border-t border-border md:grid-cols-2">
              {publishedBlogs.map((post) => (
                <Link key={post.id} href={`/${post.slug}`} className="group flex min-h-64 flex-col border-b border-r border-border bg-surface transition-colors hover:bg-brand-50">
                  <div className="p-4 sm:p-8 flex-1">
                    <h2 className="font-bold font-display tracking-tight text-2xl text-stone-900 mb-3 group-hover:text-brand-600 transition-colors line-clamp-2">
                      {post.title}
                    </h2>
                    <p className="text-stone-500 line-clamp-3 mb-6">
                      {post.excerpt || post.content.replace(/[#*`_>-]/g, "").substring(0, 150) + '...'}
                    </p>
                  </div>
                  <div className="px-4 sm:px-8 py-4 bg-stone-50/50 border-t border-stone-100/50 flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-500">
                      {post.authorRole.replace('_', ' ')}
                    </span>
                    <time className="text-sm text-stone-400">
                      {new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </time>
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4">
                {page > 1 ? (
                  <Link href={`?page=${page - 1}`} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 hover:text-stone-900 font-medium transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 border border-transparent text-stone-300 font-medium cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </div>
                )}
                
                <span className="text-sm font-medium text-stone-500">
                  Page {page} of {totalPages}
                </span>

                {page < totalPages ? (
                  <Link href={`?page=${page + 1}`} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 hover:text-stone-900 font-medium transition-colors">
                    Next <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-2 border border-transparent text-stone-300 font-medium cursor-not-allowed">
                    Next <ChevronRight className="w-4 h-4" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="w-full border-t border-border px-6 py-6 text-center">
        <p className="text-xs text-stone-500">&copy; {new Date().getFullYear()} Nisaab360. All rights reserved.</p>
      </footer>
    </div>
  );
}
