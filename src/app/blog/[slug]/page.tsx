import { notFound } from "next/navigation";
import { db } from "@/db";
import { blogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBlog(slug: string) {
  const [blog] = await db.select().from(blogs).where(and(eq(blogs.slug, slug), eq(blogs.status, 'PUBLISHED'))).limit(1);
  return blog ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const blog = await getBlog(resolvedParams.slug);
  
  if (!blog) {
    return { title: "Blog Not Found | Nisaab360" };
  }

  // Use explicit meta tags, fallback to excerpt, fallback to content
  const desc = blog.metaDescription || blog.excerpt || blog.content.replace(/[#*`_>-]/g, "").substring(0, 160).trim() + "...";
  const title = blog.metaTitle || blog.title;

  return {
    title: `${title} | Nisaab360 Blog`,
    description: desc,
    alternates: {
      canonical: `https://blog.nisaab360.app/${resolvedParams.slug}`,
    },
    openGraph: {
      title: `${title} | Nisaab360 Blog`,
      description: desc,
      url: `https://blog.nisaab360.app/${resolvedParams.slug}`,
      type: "article",
      publishedTime: new Date(blog.publishedAt || blog.createdAt).toISOString(),
    }
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const blog = await getBlog(resolvedParams.slug);

  if (!blog) {
    notFound();
  }

  return (
    <div className="public-document flex min-h-screen flex-col selection:bg-brand-300 selection:text-brand-950">
      <PublicPageHeader backHref="/blog" backLabel="Back to blog" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-6 md:py-20">
        <article className="prose prose-stone max-w-none md:prose-lg prose-headings:font-display prose-headings:font-semibold prose-a:text-brand-700 hover:prose-a:text-brand-900 prose-img:rounded-md">
          <h1 className="mb-6">{blog.title}</h1>
          <div className="flex items-center gap-4 text-sm text-stone-500 mb-12 font-medium border-b border-stone-200 pb-8">
            <span className="px-3 py-1 bg-stone-100 rounded-full">{blog.authorRole.replace('_', ' ')}</span>
            <time>Published on {new Date(blog.publishedAt || blog.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time>
          </div>
          <ReactMarkdown
            components={{
              ul: ({ children, ...props }) => (
                <ul className="my-5 list-disc space-y-2 pl-7 marker:text-brand-600" {...props}>
                  {children}
                </ul>
              ),
              ol: ({ children, ...props }) => (
                <ol className="my-5 list-decimal space-y-2 pl-7 marker:font-semibold marker:text-brand-600" {...props}>
                  {children}
                </ol>
              ),
              li: ({ children, ...props }) => (
                <li className="pl-1" {...props}>{children}</li>
              ),
            }}
          >
            {blog.content}
          </ReactMarkdown>
        </article>
      </main>

      <footer className="mt-12 w-full border-t border-border px-6 py-6 text-center">
        <p className="text-xs text-stone-500">&copy; {new Date().getFullYear()} Nisaab360. All rights reserved.</p>
      </footer>
    </div>
  );
}
