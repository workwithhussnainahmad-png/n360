import { Metadata } from "next";
import FeaturedInstitutionsClient from "@/components/FeaturedInstitutionsClient";
import { db } from "@/db";
import { featuredInstitutions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Featured Institutions | Employee",
};

export default async function EmployeeFeaturedInstitutionsPage() {
  const session = await getSession();
  if (!session || session.role !== "EMPLOYEE") redirect("/employee-login");

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
