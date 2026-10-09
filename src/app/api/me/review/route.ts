import { inputErrorResponse } from '@/lib/input-error-response';
import { validationError } from '@/lib/validation-errors';
import { NextResponse } from "next/server";
import { db } from "@/db";
import { platformReviews } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { invalidateReadCacheKeys } from "@/lib/redis";
import { eq } from "drizzle-orm";
import { z } from "zod";

const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  content: z.string().min(10).max(1000),
});

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (session?.campusReadOnly || session?.mustChangePassword) return NextResponse.json({ error: session.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : "This campus is read-only." }, { status: 403 });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only INSTITUTION role can submit platform reviews
    if ((session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const institutionId = session.institutionId || session.userId;

    const body = await req.json();
    const result = reviewSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(validationError(result.error), { status: 400 });
    }

    const { rating, content } = result.data;

    // Upsert review
    await db.insert(platformReviews).values({
      institutionId,
      rating,
      content,
    }).onConflictDoUpdate({
      target: platformReviews.institutionId,
      set: {
        rating,
        content,
        updatedAt: new Date(),
      }
    });

    // The dashboard checks this key before rendering the review prompt. Clear it
    // so router.refresh() immediately replaces the form with the saved review state.
    try {
      await invalidateReadCacheKeys([`cache:dashboard:reviews:${institutionId}`, "cache:public:landing:v1"]);
    } catch (error) {
      console.warn("Failed to invalidate dashboard review cache:", error);
    }

    return NextResponse.json({ message: "Review saved successfully" });
  } catch (error) {
    const publicInputError = inputErrorResponse(error);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error("Error saving review:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
