import { notFound } from "next/navigation";
import { db } from "@/db";
import { platformPages } from "@/db/schema";
import { eq } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import { unstable_cache } from "next/cache";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const revalidate = 300;

const getPlatformPage = unstable_cache(
  async (slug: string) => {
    const [page] = await db.select().from(platformPages).where(eq(platformPages.slug, slug)).limit(1);
    return page ?? null;
  },
  ["platform-page"],
  { revalidate: 300, tags: ["platform-pages"] }
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const page = await getPlatformPage(resolvedParams.slug);
  
  if (!page) {
    return { title: "Page Not Found | Nisaab360" };
  }

  return {
    title: page.title,
    description: `Read the ${page.title} for Nisaab360.`,
    alternates: {
      canonical: `/${resolvedParams.slug}`,
    },
    openGraph: {
      title: `${page.title} | Nisaab360`,
      description: `Read the ${page.title} for Nisaab360.`,
      url: `https://nisaab360.app/${resolvedParams.slug}`,
    }
  };
}

export default async function StaticPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const page = await getPlatformPage(resolvedParams.slug);

  if (!page) {
    notFound();
  }

  return (
    <div className="public-document flex min-h-screen flex-col selection:bg-brand-300 selection:text-brand-950">
      <PublicPageHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-6 md:py-20">
        <article className="prose prose-stone max-w-none md:prose-lg prose-headings:font-display prose-headings:font-semibold prose-a:text-brand-700 hover:prose-a:text-brand-900 prose-img:rounded-md">
          <h1 className="mb-8">{page.title}</h1>
          <div className="text-sm text-stone-500 mb-12 uppercase tracking-wider font-semibold">
            Last updated: {new Date(page.updatedAt).toLocaleDateString()}
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
            {page.content}
          </ReactMarkdown>
        </article>
      </main>

      <footer className="w-full border-t border-border px-6 py-6 text-center">
        <p className="text-xs text-stone-500">&copy; {new Date().getFullYear()} Nisaab360. All rights reserved.</p>
      </footer>
    </div>
  );
}
