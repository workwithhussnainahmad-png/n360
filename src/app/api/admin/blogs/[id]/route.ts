import { NextResponse } from "next/server";
import { db } from "@/db";
import { blogs } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const blogUpdateSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  content: z.string(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  publishedAt: z.string().optional().transform(str => str ? new Date(str) : undefined),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const result = blogUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid data", details: result.error.issues }, { status: 400 });
    }

    // Check slug uniqueness excluding self
    const existingBlogs = await db.select().from(blogs).where(eq(blogs.slug, result.data.slug));
    if (existingBlogs.some(b => b.id !== id)) {
      return NextResponse.json({ error: "A blog with this slug already exists" }, { status: 409 });
    }

    const updatedBlog = await db.update(blogs)
      .set({
        title: result.data.title,
        slug: result.data.slug,
        content: result.data.content,
        metaTitle: result.data.metaTitle,
        metaDescription: result.data.metaDescription,
        excerpt: result.data.excerpt,
        status: result.data.status,
        publishedAt: result.data.publishedAt,
      })
      .where(eq(blogs.id, id))
      .returning();

    return NextResponse.json(updatedBlog[0]);
  } catch (error) {
    console.error("Error updating blog:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    await db.delete(blogs).where(eq(blogs.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting blog:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
