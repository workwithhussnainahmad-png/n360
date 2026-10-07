import { NextResponse } from "next/server";
import { db } from "@/db";
import { platformPages } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const pageSchema = z.object({
  slug: z.string().min(1).max(255),
  title: z.string().min(1).max(255),
  content: z.string(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pages = await db.select().from(platformPages).orderBy(platformPages.title);
    return NextResponse.json(pages);
  } catch (error) {
    console.error("Error fetching pages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = pageSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid data", details: result.error.issues }, { status: 400 });
    }

    const { slug, title, content } = result.data;

    // Role Clarification Enforcements
    if (slug === "pricing" && session.role === "EMPLOYEE") {
      return NextResponse.json({ error: "Forbidden: Employees cannot edit the pricing page" }, { status: 403 });
    }

    const [existingPage] = await db.select().from(platformPages).where(eq(platformPages.slug, slug));
    const now = new Date();
    
    if (existingPage) {
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      if (existingPage.lastEditedAt && existingPage.lastEditedAt > fiveMinutesAgo) {
        return NextResponse.json(
          { error: "Page is currently locked for editing. Please wait 5 minutes after the last edit." }, 
          { status: 423 }
        );
      }

      await db.update(platformPages)
        .set({
          title,
          content,
          lastEditedAt: now,
          lastEditedBy: session.userId,
          updatedAt: now,
        })
        .where(eq(platformPages.slug, slug));
    } else {
      await db.insert(platformPages).values({
        slug,
        title,
        content,
        lastEditedAt: now,
        lastEditedBy: session.userId,
      });
    }

    return NextResponse.json({ message: "Page saved successfully" });
  } catch (error) {
    console.error("Error saving page:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
