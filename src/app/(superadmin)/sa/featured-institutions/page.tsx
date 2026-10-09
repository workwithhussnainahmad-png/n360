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

      <FeaturedInstitutionsClient
        initialInstitutions={institutions.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
