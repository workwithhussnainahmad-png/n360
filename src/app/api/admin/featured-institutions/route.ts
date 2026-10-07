import { NextResponse } from "next/server";
import { db } from "@/db";
import { featuredInstitutions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const featuredInstSchema = z.object({
  name: z.string().min(1).max(255),
  logoKey: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const insts = await db.select().from(featuredInstitutions).orderBy(featuredInstitutions.createdAt);
    return NextResponse.json(insts);
  } catch (error) {
    console.error("Error fetching featured institutions:", error);
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
    const result = featuredInstSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid data", details: result.error.issues }, { status: 400 });
    }

    const { name, logoKey } = result.data;

    await db.insert(featuredInstitutions).values({
      name,
      logoKey: logoKey || null,
    });

    return NextResponse.json({ message: "Featured institution added successfully" });
  } catch (error) {
    console.error("Error adding featured institution:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getSession();
    if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "EMPLOYEE")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const idStr = url.searchParams.get("id");
    if (!idStr) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }
    
    const id = parseInt(idStr, 10);

    await db.delete(featuredInstitutions).where(eq(featuredInstitutions.id, id));

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting featured institution:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
