import { Metadata } from "next";
import FeaturedInstitutionsClient from "@/components/FeaturedInstitutionsClient";
import { db } from "@/db";
import { featuredInstitutions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Featured Institutions | Super Admin",
};

export default async function FeaturedInstitutionsPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");

  const institutions = await db
    .select({
      id: featuredInstitutions.id,
      name: featuredInstitutions.name,
      logoKey: featuredInstitutions.logoKey,
      createdAt: featuredInstitutions.createdAt,
    })
    .from(featuredInstitutions)
    .orderBy(featuredInstitutions.createdAt);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold font-display text-stone-900 mb-2">Featured Institutions</h1>
      <p className="text-stone-500 mb-8">Manage the partner institutions and logos displayed on the public homepage marquee.</p>
      <FeaturedInstitutionsClient
        initialInstitutions={institutions.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
