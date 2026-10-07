import { db } from "@/db";
import { institutions, institutionOwners, students, staff, classes, sections } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, Users, UserSquare2, BookOpen, Layers, UserCircle, Phone, Mail, FileCheck, Archive } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getPricingPlan } from "@/lib/pricing";
import { InstitutionEnterpriseCampuses } from "@/components/InstitutionEnterpriseCampuses";
import { InstitutionPublicSiteControl } from "@/components/InstitutionPublicSiteControl";

export default async function SAInstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const institutionId = parseInt(resolvedParams.id, 10);
  if (!Number.isInteger(institutionId)) {
    notFound();
  }

  const [institution] = await db.select({
    id: institutions.id,
    name: institutions.name,
    username: institutions.username,
    type: institutions.type,
    pricingPlan: institutions.pricingPlan,
    parentInstitutionId: institutions.parentInstitutionId,
    status: institutions.status,
    city: institutions.city,
    country: institutions.country,
    address: institutions.address,
    contactEmail: institutions.contactEmail,
    contactPhone: institutions.contactPhone,
    registrationNumber: institutions.registrationNumber,
    publicSlug: institutions.publicSlug,
    publicSiteEnabled: institutions.publicSiteEnabled,
    createdAt: institutions.createdAt,
  }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  if (!institution) {
    notFound();
  }

  const [
    ownerRows,
    studentsCountRows,
    staffCountRows,
    classesCountRows,
    sectionsCountRows,
    institutionClasses,
    institutionSections,
  ] = await Promise.all([
    db.select({
      name: institutionOwners.name,
      gender: institutionOwners.gender,
      email: institutionOwners.email,
      contactNumber: institutionOwners.contactNumber,
    }).from(institutionOwners).where(eq(institutionOwners.institutionId, institutionId)).limit(1),
    db.select({ value: count() }).from(students).where(eq(students.institutionId, institutionId)),
    db.select({ value: count() }).from(staff).where(eq(staff.institutionId, institutionId)),
    db.select({ value: count() }).from(classes).where(eq(classes.institutionId, institutionId)),
    db.select({ value: count() }).from(sections).where(eq(sections.institutionId, institutionId)),
    db.select({ name: classes.name }).from(classes).where(eq(classes.institutionId, institutionId)),
    db.select({ name: sections.name }).from(sections).where(eq(sections.institutionId, institutionId)),
  ]);
  const owner = ownerRows[0];
  const selectedPlan = getPricingPlan(institution.pricingPlan);
  const studentsCount = studentsCountRows[0];
  const staffCount = staffCountRows[0];
  const classesCount = classesCountRows[0];
  const sectionsCount = sectionsCountRows[0];
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/sa/institutions" prefetch={false} className="text-sm text-stone-500 hover:text-brand-600 transition-colors">
              &larr; Back to Institutions
            </Link>
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-950">{institution.name}</h1>
          <p className="text-stone-500 mt-1">Institution details and statistics.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/agreement-nisaab360?id=${institution.id}`} target="_blank" rel="noopener noreferrer">
              <FileCheck className="mr-2 h-4 w-4" />
              View Agreement
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/sa/backups?institutionId=${institution.id}`}>
              <Archive className="mr-2 h-4 w-4" /> Backups
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Students" value={studentsCount.value.toString()} icon={Users} />
        <StatCard title="Total Staff" value={staffCount.value.toString()} icon={UserSquare2} />
        <StatCard title="Classes" value={classesCount.value.toString()} icon={BookOpen} />
        <StatCard title="Sections" value={sectionsCount.value.toString()} icon={Layers} />
      </div>

      {institution.pricingPlan === "ENTERPRISE" && institution.parentInstitutionId === null && institution.status === "APPROVED" && <InstitutionEnterpriseCampuses institutionId={institution.id} />}

      <InstitutionPublicSiteControl
        institutionId={institution.id}
        institutionStatus={institution.status}
        initialSlug={institution.publicSlug}
        initialEnabled={institution.publicSiteEnabled}
        baseDomain={process.env.PUBLIC_SITE_BASE_DOMAIN || 'nisaab360.app'}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-600" />
              Institution Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-stone-500">Username</p>
                <p className="font-medium text-stone-900">{institution.username}</p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Type</p>
                <p className="font-medium text-stone-900">{institution.type}</p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Selected Plan</p>
                <p className="font-medium text-stone-900">
                  {selectedPlan ? `${selectedPlan.name} — ${selectedPlan.monthly}` : "Not selected"}
                </p>
              </div>
              <div>
                <p className="text-sm text-stone-500">Status</p>
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full inline-block mt-1 ${
                  institution.status === 'PENDING' ? 'bg-warning/20 text-yellow-700' :
                  institution.status === 'APPROVED' ? 'bg-success/20 text-emerald-700' :
                  'bg-danger/20 text-red-700'
                }`}>
                  {institution.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-stone-500">Registration Date</p>
                <p className="font-medium text-stone-900">{new Date(institution.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-stone-500">Location</p>
                <p className="font-medium text-stone-900">{institution.address}, {institution.city}, {institution.country}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-brand-600" />
              Owner Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {owner ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 border-b border-border pb-4">
                  <div className="h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xl">
                    {owner.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-stone-900">{owner.name}</h3>
                    <p className="text-sm text-stone-500 capitalize">{owner.gender.toLowerCase()}</p>
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-stone-400" />
                    <span className="text-stone-700">{owner.email}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-stone-400" />
                    <span className="text-stone-700">{owner.contactNumber}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-4 sm:py-8 text-center">
                <FileCheck className="h-12 w-12 text-stone-300 mb-3" />
                <p className="text-stone-500 mb-1">No owner details found.</p>
                <p className="text-sm text-stone-400">The institution owner has not completed their onboarding yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-600" />
              Classes ({institutionClasses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {institutionClasses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {institutionClasses.map((c, i) => (
                  <span key={i} className="px-3 py-1 bg-brand-50 text-brand-700 text-sm font-medium rounded-full border border-brand-200">
                    {c.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-stone-500 text-sm italic">No classes found.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-brand-600" />
              Sections ({institutionSections.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {institutionSections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {institutionSections.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-stone-100 text-stone-700 text-sm font-medium rounded-full border border-stone-200">
                    {s.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-stone-500 text-sm italic">No sections found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
