import { listOpenAdmissionCampuses, openAdmissionCampusExistsSql } from '@/lib/admission-campus';
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionEnrollments,
  admissionApplicationEvents,
  admissionApplications,
  admissionAppointments,
  admissionCycles,
  admissionDocumentRequests,
  admissionFeePayments,
  admissionOfferings,
  students,
} from "@/db/schema";
import {
  ADMISSION_SESSION_COOKIE,
  verifyAdmissionSessionToken,
} from "@/lib/admission-auth";
import {
  institutionPublicUrl,
  parseInstitutionHostname,
} from "@/lib/institution-domain";
import { resolveInstitutionTenant } from "@/lib/institution-tenant";
import { getPublishedPublicEvent, listPublishedPublicEvents } from "@/lib/public-event-queries";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";
import { getActiveApplicantAccount } from "@/lib/admission-account";
import type { PublicInstitutionTenant } from "@/lib/institution-tenant";
import { AdmissionIntakeForms } from "./AdmissionIntakeForms";
import { ApplicantLoginForm } from "./ApplicantLoginForm";
import { ApplicantChangePasswordForm } from "./ApplicantChangePasswordForm";
import { ApplicantLogoutButton } from "./ApplicantLogoutButton";
import { ApplicantDocumentUpload } from "./ApplicantDocumentUpload";
import { ApplicantFeePayment } from "./ApplicantFeePayment";
import { InstitutionHomepage } from "./InstitutionHomepage";
import { admissionCalendarDate, admissionCalendarDateSql } from "@/lib/admission-calendar";
import { PublicEventPage } from "./PublicEventPage";

// Institution publication state is mutable and tenant slugs can be assigned
// after the first request. Never persist a pre-publication notFound() response
// in Next's full-route cache; tenant settings are fresh on every request.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const admissionToday = admissionCalendarDateSql();

type TenantSitePageProps = {
  params: Promise<{ slug: string; path?: string[] }>;
};

async function getRequestTenant(slug: string) {
  const requestHeaders = await headers();
  const parsedHostname = parseInstitutionHostname(
    requestHeaders.get("host") || "",
    await getPublicSiteBaseDomain(),
  );
  if (parsedHostname.kind !== "institution" || parsedHostname.slug !== slug)
    return null;

  const resolution = await resolveInstitutionTenant(slug);
  return resolution.kind === "active" ? resolution.tenant : null;
}

async function getStudentLoginUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "";
  const port = host.match(/:(\d+)$/)?.[1];
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1"
  ) {
    const protocol =
      requestHeaders.get("x-forwarded-proto") === "https" ? "https" : "http";
    return `${protocol}://localhost${port ? `:${port}` : ""}/login`;
  }
  return `https://${await getPublicSiteBaseDomain()}/login`;
}

export async function generateMetadata({
  params,
}: TenantSitePageProps): Promise<Metadata> {
  const { slug, path } = await params;
  const tenantRoute = path?.join("/") || "";
  const eventSlug = path?.length === 2 && (path[0] === "event" || path[0] === "events") ? path[1] : null;
  const isAdmissionsPage = tenantRoute === "admissions";
  const isApplicantRoute = [
    "admissions/login",
    "admissions/change-password",
    "admissions/portal",
  ].includes(tenantRoute);
  if (tenantRoute && !isAdmissionsPage && !isApplicantRoute && !eventSlug)
    return { title: "Page Not Found", robots: { index: false, follow: false } };

  const tenant = await getRequestTenant(slug);
  if (!tenant)
    return {
      title: "Institution Not Found",
      robots: { index: false, follow: false },
    };

  const publicEvent = eventSlug ? await getPublishedPublicEvent(tenant.id, eventSlug) : null;
  if (eventSlug && !publicEvent) return { title: "Event Not Found", robots: { index: false, follow: false } };

  const canonical = institutionPublicUrl(
    tenant.publicSlug,
    undefined,
    "https:",
    await getPublicSiteBaseDomain(),
  );
  const fallbackDescription = `${tenant.name}, a ${tenant.type.toLowerCase()} in ${tenant.city}, ${tenant.country}. View official institution information on Nisaab360.`;
  const description = tenant.description
    ? `${tenant.description.slice(0, 157)}${tenant.description.length > 157 ? "..." : ""}`
    : fallbackDescription;

  return {
    title: publicEvent
      ? `${publicEvent.title} | ${tenant.name}`
      : isAdmissionsPage
      ? `Admissions | ${tenant.name}`
      : isApplicantRoute
        ? `Applicant Portal | ${tenant.name}`
        : tenant.name,
    description: publicEvent?.summary || description,
    alternates: {
      canonical: publicEvent
        ? `${canonical}/event/${publicEvent.slug}`
        : isAdmissionsPage
        ? `${canonical}/admissions`
        : isApplicantRoute
          ? undefined
          : canonical,
    },
    openGraph: {
      title: publicEvent?.title || tenant.name,
      description: publicEvent?.summary || description,
      url: publicEvent ? `${canonical}/event/${publicEvent.slug}` : isAdmissionsPage ? `${canonical}/admissions` : canonical,
      siteName: tenant.name,
      type: "website",
      images: publicEvent?.coverImageUrl
        ? [{ url: publicEvent.coverImageUrl, alt: publicEvent.title }]
        : tenant.heroImageUrl
        ? [{ url: tenant.heroImageUrl, alt: tenant.tagline || tenant.name }]
        : tenant.logoKey.startsWith("http")
          ? [{ url: tenant.logoKey, alt: `${tenant.name} logo` }]
          : undefined,
    },
    robots: {
      index: isApplicantRoute
        ? false
        : !isAdmissionsPage || tenant.admissionsEnabled,
      follow: !isApplicantRoute,
    },
  };
}

export default async function TenantSitePage({ params }: TenantSitePageProps) {
  const { slug, path } = await params;
  const tenantRoute = path?.join("/") || "";
  const eventSlug = path?.length === 2 && (path[0] === "event" || path[0] === "events") ? path[1] : null;
  const allowedRoutes = [
    "",
    "admissions",
    "admissions/login",
    "admissions/change-password",
    "admissions/portal",
  ];
  if (!allowedRoutes.includes(tenantRoute) && !eventSlug) notFound();

  const tenant = await getRequestTenant(slug);
  if (!tenant) notFound();
  if (eventSlug) {
    const event = await getPublishedPublicEvent(tenant.id, eventSlug);
    if (!event) notFound();
    if (path?.[0] === "events") redirect(`/event/${event.slug}`);
    return <PublicEventPage tenant={tenant} event={event} />;
  }
  const studentLoginUrl = await getStudentLoginUrl();
  if (!tenantRoute) {
    const publicEvents = await listPublishedPublicEvents(tenant.id);
    return (
      <InstitutionHomepage
        tenant={tenant}
        baseDomain={await getPublicSiteBaseDomain()}
        studentLoginUrl={studentLoginUrl}
        publicEvents={publicEvents}
      />
    );
  }
  if (tenantRoute === "admissions")
    return (
      <TenantAdmissionsPage tenant={tenant} studentLoginUrl={studentLoginUrl} />
    );
  if (tenantRoute === "admissions/login")
    return (
      <ApplicantLoginPage tenant={tenant} studentLoginUrl={studentLoginUrl} />
    );
  if (tenantRoute === "admissions/change-password")
    return (
      <ApplicantChangePasswordPage
        tenant={tenant}
        studentLoginUrl={studentLoginUrl}
      />
    );
  if (tenantRoute === "admissions/portal")
    return (
      <ApplicantPortalPage tenant={tenant} studentLoginUrl={studentLoginUrl} />
    );

  const publicUrl = institutionPublicUrl(
    tenant.publicSlug,
    undefined,
    "https:",
    await getPublicSiteBaseDomain(),
  );
  const publicHostname = new URL(publicUrl).hostname;
  const institutionType =
    tenant.type.charAt(0) + tenant.type.slice(1).toLowerCase();
  const introduction =
    tenant.description ||
    `${institutionType} based in ${tenant.city}, ${tenant.country}. Institution information and admission updates are published here.`;
  const hasPublicContact = Boolean(
    tenant.publicEmail || tenant.publicPhone || tenant.publicAddress,
  );
  const hasRenderableLogo =
    tenant.logoKey.startsWith("http") || tenant.logoKey.startsWith("/");
  const organizationId = `${publicUrl}#organization`;
  const socialProfiles = [
    tenant.facebookUrl,
    tenant.instagramUrl,
    tenant.youtubeUrl,
  ].filter((url): url is string => Boolean(url));
  const absoluteLogo = hasRenderableLogo
    ? new URL(tenant.logoKey, publicUrl).toString()
    : undefined;
  const absoluteHeroImage = tenant.heroImageUrl
    ? new URL(tenant.heroImageUrl, publicUrl).toString()
    : undefined;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": tenant.type === "SCHOOL" ? "School" : "CollegeOrUniversity",
        "@id": organizationId,
        name: tenant.name,
        url: publicUrl,
        description: introduction,
        logo: absoluteLogo,
        image: absoluteHeroImage || absoluteLogo,
        email: tenant.publicEmail || undefined,
        telephone: tenant.publicPhone || undefined,
        sameAs: socialProfiles.length ? socialProfiles : undefined,
        address: {
          "@type": "PostalAddress",
          streetAddress: tenant.publicAddress || undefined,
          addressLocality: tenant.city,
          addressCountry: tenant.country,
        },
        contactPoint:
          tenant.publicEmail || tenant.publicPhone
            ? {
                "@type": "ContactPoint",
                contactType: "admissions and general enquiries",
                email: tenant.publicEmail || undefined,
                telephone: tenant.publicPhone || undefined,
              }
            : undefined,
      },
      {
        "@type": "WebSite",
        "@id": `${publicUrl}#website`,
        url: publicUrl,
        name: tenant.name,
        description: introduction,
        publisher: { "@id": organizationId },
        inLanguage: "en-PK",
      },
    ],
  }).replace(/</g, "\\u003c");

  return (
    <div
      className="min-h-screen bg-[#f5f3ed] text-[#18201d]"
      style={{ "--site-accent": tenant.accentColor } as CSSProperties}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredData }}
      />

      <header className="border-b border-black/10 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3"
            aria-label={`${tenant.name} home`}
          >
            {hasRenderableLogo ? (
              <Image
                className="h-11 w-11 rounded-xl border border-black/10 bg-white object-contain p-1"
                src={tenant.logoKey}
                alt=""
                width={44}
                height={44}
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--site-accent)] text-sm font-bold text-white">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="truncate font-display text-lg font-semibold">
              {tenant.name}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/admissions/login"
              className="text-xs font-semibold text-stone-600 sm:text-sm"
            >
              Applicant portal
            </Link>
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tenant.admissionsEnabled ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}
            >
              Admissions {tenant.admissionsEnabled ? "open" : "closed"}
            </span>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(199,222,93,0.35),transparent_38%),linear-gradient(135deg,#f5f3ed_0%,#e8eee7_100%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-[1.4fr_0.6fr] md:py-28">
            <div>
              <p className="mb-5 text-sm font-bold uppercase tracking-[0.22em] text-[var(--site-accent)]">
                Official institution website
              </p>
              <h1 className="max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-6xl">
                {tenant.name}
              </h1>
              {tenant.tagline && (
                <p className="mt-5 max-w-3xl text-2xl font-semibold leading-9 text-stone-800">
                  {tenant.tagline}
                </p>
              )}
              <p className="mt-6 max-w-2xl whitespace-pre-line text-lg leading-8 text-stone-600">
                {introduction}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                {tenant.admissionsEnabled ? (
                  <Link
                    href="/admissions"
                    className="rounded-lg bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Apply for admission
                  </Link>
                ) : (
                  <span className="rounded-lg border border-black/15 bg-white/70 px-5 py-3 text-sm font-semibold text-stone-700">
                    Admissions are not currently open
                  </span>
                )}
              </div>
            </div>

            <aside className="self-end rounded-2xl border border-black/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(24,32,29,0.08)]">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
                Institution details
              </p>
              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-xs text-stone-500">Type</dt>
                  <dd className="mt-1 font-semibold">{institutionType}</dd>
                </div>
                <div className="border-t border-black/10 pt-4">
                  <dt className="text-xs text-stone-500">Location</dt>
                  <dd className="mt-1 font-semibold">
                    {tenant.city}, {tenant.country}
                  </dd>
                </div>
                <div className="border-t border-black/10 pt-4">
                  <dt className="text-xs text-stone-500">Website</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {publicHostname}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="grid gap-6 md:grid-cols-3">
            <article className="rounded-2xl border border-black/10 bg-white p-6">
              <p className="text-sm font-bold text-[var(--site-accent)]">01</p>
              <h2 className="mt-4 text-xl font-semibold">
                Official information
              </h2>
              <p className="mt-3 leading-7 text-stone-600">
                Updates shown on this website come directly from the
                institution.
              </p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white p-6">
              <p className="text-sm font-bold text-[var(--site-accent)]">02</p>
              <h2 className="mt-4 text-xl font-semibold">Admission status</h2>
              <p className="mt-3 leading-7 text-stone-600">
                Check here to see when the institution is accepting
                applications.
              </p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white p-6">
              <p className="text-sm font-bold text-[var(--site-accent)]">03</p>
              <h2 className="mt-4 text-xl font-semibold">
                Powered by Nisaab360
              </h2>
              <p className="mt-3 leading-7 text-stone-600">
                A verified digital presence connected to the institution
                management platform.
              </p>
            </article>
          </div>
        </section>

        {hasPublicContact && (
          <section className="border-t border-black/10 bg-white">
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--site-accent)]">
                Contact
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                Contact {tenant.name}
              </h2>
              <div className="mt-8 flex flex-wrap gap-3">
                {tenant.publicEmail && (
                  <a
                    className="rounded-lg bg-[var(--site-accent)] px-5 py-3 text-sm font-semibold text-white"
                    href={`mailto:${tenant.publicEmail}`}
                  >
                    Email institution
                  </a>
                )}
                {tenant.publicPhone && (
                  <a
                    className="rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold"
                    href={`tel:${tenant.publicPhone}`}
                  >
                    Call {tenant.publicPhone}
                  </a>
                )}
              </div>
              {tenant.publicAddress && (
                <p className="mt-6 max-w-2xl whitespace-pre-line leading-7 text-stone-600">
                  {tenant.publicAddress}
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-black/10 bg-[var(--site-accent)] text-white/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            &copy; {new Date().getFullYear()} {tenant.name}
          </p>
          <p>Powered by Nisaab360</p>
        </div>
      </footer>
    </div>
  );
}

async function getApplicantAccount(institutionId: number) {
  const cookieStore = await cookies();
  const session = await verifyAdmissionSessionToken(
    cookieStore.get(ADMISSION_SESSION_COOKIE)?.value,
  );
  if (!session || session.institutionId !== institutionId) return null;
  return getActiveApplicantAccount(session, institutionId);
}

function ApplicantPageShell({
  tenant,
  studentLoginUrl,
  title,
  description,
  children,
}: {
  tenant: PublicInstitutionTenant;
  studentLoginUrl: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const hasLogo =
    tenant.logoKey.startsWith("http") || tenant.logoKey.startsWith("/");
  return (
    <div
      className="min-h-screen bg-[#f2efe7] text-[#171c1a]"
      style={{ "--site-accent": tenant.accentColor } as CSSProperties}
    >
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between border-x border-black/10 px-5 sm:px-8">
          {" "}
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {hasLogo && (
              <Image
                src={tenant.logoKey}
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 border border-black/10 bg-white object-contain"
              />
            )}
            <span className="truncate font-display text-base font-semibold sm:text-lg">
              {tenant.name}
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href={studentLoginUrl}
              className="text-xs font-semibold text-black/45 hover:text-black"
            >
              Student login
            </Link>
            <Link
              href="/admissions"
              className="text-xs font-bold text-[var(--site-accent)]"
            >
              Admissions
            </Link>
            <Link
              href="/"
              className="hidden text-xs font-semibold text-black/45 hover:text-black sm:block"
            >
              Institution website
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-79px)] max-w-[1440px] border-x border-black/10 lg:grid-cols-[0.48fr_0.52fr]">
        <section className="flex flex-col justify-between border-b border-black/10 bg-[var(--site-accent)] p-7 text-white sm:p-12 lg:border-b-0 lg:border-r lg:border-white/15 lg:p-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
            Applicant access
          </p>
          <div className="py-16">
            <h1 className="max-w-lg font-display text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl">
              {title}
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-white/65">
              {description}
            </p>
          </div>
          <p className="text-xs text-white/45">
            Secure admissions portal for {tenant.name}
          </p>
        </section>
        <section className="flex items-center bg-[#fbf9f4] p-6 sm:p-12 lg:p-16">
          <div className="w-full max-w-md">
            <p className="mb-7 border-b border-black/10 pb-4 text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">
              Enter your account details
            </p>
            {children}
          </div>
        </section>
      </main>
    </div>
  );
}

async function ApplicantLoginPage({
  tenant,
  studentLoginUrl,
}: {
  tenant: PublicInstitutionTenant;
  studentLoginUrl: string;
}) {
  const account = await getApplicantAccount(tenant.id);
  if (account) redirect("/admissions/portal");
  return (
    <ApplicantPageShell
      tenant={tenant}
      studentLoginUrl={studentLoginUrl}
      title="Applicant login"
      description="Use the parent or guardian email and password created with your first application."
    >
      <ApplicantLoginForm accentColor={tenant.accentColor} />
    </ApplicantPageShell>
  );
}

async function ApplicantChangePasswordPage({
  tenant,
  studentLoginUrl,
}: {
  tenant: PublicInstitutionTenant;
  studentLoginUrl: string;
}) {
  const account = await getApplicantAccount(tenant.id);
  if (!account) redirect("/admissions/login");
  return (
    <ApplicantPageShell
      tenant={tenant}
      studentLoginUrl={studentLoginUrl}
      title="Change password"
      description="Choose a private password for this institution's applicant portal."
    >
      <ApplicantChangePasswordForm accentColor={tenant.accentColor} />
    </ApplicantPageShell>
  );
}

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Application submitted",
  UNDER_REVIEW: "Under review",
  DOCUMENTS_REQUIRED: "Documents required",
  TEST_SCHEDULED: "Admission test scheduled",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  DECISION_PENDING: "Decision pending",
  OFFERED: "Admission offered",
  REJECTED: "Application not accepted",
  FEE_PENDING: "Fee payment pending",
  FEE_VERIFICATION: "Fee verification pending",
  FEE_VERIFIED: "Fee verified",
  ENROLLED: "Enrolled",
  WITHDRAWN: "Withdrawn",
};

async function ApplicantPortalPage({
  tenant,
  studentLoginUrl,
}: {
  tenant: PublicInstitutionTenant;
  studentLoginUrl: string;
}) {
  const account = await getApplicantAccount(tenant.id);
  if (!account) redirect("/admissions/login");

  const applications = await db
    .select({
      id: admissionApplications.id,
      institutionId: admissionApplications.institutionId,
      applicationNumber: admissionApplications.applicationNumber,
      studentName: admissionApplications.studentName,
      campusName: admissionApplications.campusName,
      status: admissionApplications.status,
      submittedAt: admissionApplications.submittedAt,
      offeringTitle: admissionOfferings.title,
      cycleName: admissionCycles.name,
    })
    .from(admissionApplications)
    .innerJoin(
      admissionOfferings,
      eq(admissionOfferings.id, admissionApplications.offeringId),
    )
    .innerJoin(
      admissionCycles,
      eq(admissionCycles.id, admissionApplications.cycleId),
    )
    .where(
      and(
        eq(admissionApplications.applicantId, account.id),
        eq(admissionApplications.intakeInstitutionId, tenant.id),
        or(
          ne(admissionApplications.status, "ENROLLED"),
          sql`exists (
          select 1 from ${admissionEnrollments}
          where ${admissionEnrollments.applicationId} = ${admissionApplications.id}
            and ${admissionEnrollments.institutionId} = ${admissionApplications.institutionId}
            and ${admissionEnrollments.createdAt} >= now() - interval '7 days'
        )`,
        ),
      ),
    )
    .orderBy(desc(admissionApplications.submittedAt));

  const applicationIds = applications.map((application) => application.id);
  const [documents, appointments, events, feePayments, enrollments] =
    applicationIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: admissionDocumentRequests.id,
              applicationId: admissionDocumentRequests.applicationId,
              documentName: admissionDocumentRequests.documentName,
              instructions: admissionDocumentRequests.instructions,
              status: admissionDocumentRequests.status,
              reviewerNote: admissionDocumentRequests.reviewerNote,
              createdAt: admissionDocumentRequests.createdAt,
            })
            .from(admissionDocumentRequests)
            .where(
              and(
                inArray(admissionDocumentRequests.institutionId, applications.map(application => application.institutionId)),
                inArray(
                  admissionDocumentRequests.applicationId,
                  applicationIds,
                ),
              ),
            )
            .orderBy(asc(admissionDocumentRequests.createdAt)),
          db
            .select()
            .from(admissionAppointments)
            .where(
              and(
                inArray(admissionAppointments.institutionId, applications.map(application => application.institutionId)),
                inArray(admissionAppointments.applicationId, applicationIds),
              ),
            )
            .orderBy(asc(admissionAppointments.scheduledAt)),
          db
            .select()
            .from(admissionApplicationEvents)
            .where(
              and(
                inArray(admissionApplicationEvents.institutionId, applications.map(application => application.institutionId)),
                inArray(
                  admissionApplicationEvents.applicationId,
                  applicationIds,
                ),
                eq(admissionApplicationEvents.visibleToApplicant, true),
              ),
            )
            .orderBy(asc(admissionApplicationEvents.createdAt)),
          db
            .select({
              id: admissionFeePayments.id,
              applicationId: admissionFeePayments.applicationId,
              amount: admissionFeePayments.amount,
              dueDate: admissionFeePayments.dueDate,
              instructions: admissionFeePayments.instructions,
              bankName: admissionFeePayments.bankName,
              accountNumber: admissionFeePayments.accountNumber,
              qrUrl: admissionFeePayments.qrUrl,
              paymentMethods: admissionFeePayments.paymentMethods,
              payerReference: admissionFeePayments.payerReference,
              payerSourceBank: admissionFeePayments.payerSourceBank,
              status: admissionFeePayments.status,
              reviewerNote: admissionFeePayments.reviewerNote,
              submittedAt: admissionFeePayments.submittedAt,
            })
            .from(admissionFeePayments)
            .where(
              and(
                inArray(admissionFeePayments.institutionId, applications.map(application => application.institutionId)),
                inArray(admissionFeePayments.applicationId, applicationIds),
              ),
            ),
          db
            .select({
              applicationId: admissionEnrollments.applicationId,
              loginRollNumber: students.loginRollNumber,
              createdAt: admissionEnrollments.createdAt,
            })
            .from(admissionEnrollments)
            .innerJoin(
              students,
              and(
                eq(students.id, admissionEnrollments.studentId),
                eq(students.institutionId, admissionEnrollments.institutionId),
              ),
            )
            .where(
              and(
                inArray(admissionEnrollments.institutionId, applications.map(application => application.institutionId)),
                inArray(admissionEnrollments.applicationId, applicationIds),
              ),
            ),
        ])
      : [[], [], [], [], []];

  const STATUS_CONFIG: Record<
    string,
    { label: string; tone: "green" | "amber" | "blue" | "red" | "slate"; description: string }
  > = {
    SUBMITTED: {
      label: "Application Submitted",
      tone: "blue",
      description: "Your application has been received and is queued for verification by the admissions directorate.",
    },
    UNDER_REVIEW: {
      label: "Under Committee Review",
      tone: "amber",
      description: "The admissions evaluation committee is reviewing your academic credentials and transcripts.",
    },
    DOCUMENTS_REQUIRED: {
      label: "Action Required: Documents Missing",
      tone: "amber",
      description: "Additional documentation is required to complete verification. Please upload requested files below.",
    },
    TEST_SCHEDULED: {
      label: "Admission Test Scheduled",
      tone: "blue",
      description: "Your written entrance examination has been scheduled. Check venue and reporting instructions below.",
    },
    INTERVIEW_SCHEDULED: {
      label: "Interview Scheduled",
      tone: "blue",
      description: "You are shortlisted for an admissions interview. Review your interview schedule and reporting venue below.",
    },
    DECISION_PENDING: {
      label: "Merit Decision Pending",
      tone: "amber",
      description: "Test/interview scores are being tabulated. Merit lists and selection decisions will be published shortly.",
    },
    OFFERED: {
      label: "Admission Offer Issued",
      tone: "green",
      description: "Congratulations! You have been selected for admission. Please review and pay your admission fee to secure your seat.",
    },
    FEE_PENDING: {
      label: "Provisional Admission Offer",
      tone: "amber",
      description: "Your admission offer is provisional. Submit your admission fee payment before the due date to confirm your seat.",
    },
    FEE_VERIFICATION: {
      label: "Fee Under Verification",
      tone: "amber",
      description: "Your fee deposit details have been received and are currently being verified by the accounts office.",
    },
    FEE_VERIFIED: {
      label: "Fee Verified",
      tone: "green",
      description: "Your admission fee payment has been confirmed. Permanent student registration is being finalized.",
    },
    REFUND_REQUIRED: {
      label: "Fee Adjustment Flagged",
      tone: "slate",
      description: "An administrative fee adjustment has been flagged for this application.",
    },
    ENROLLED: {
      label: "Officially Enrolled",
      tone: "green",
      description: "You are officially enrolled as a registered student! Your permanent login roll number is active below.",
    },
    REJECTED: {
      label: "Application Not Selected",
      tone: "red",
      description: "We regret to inform you that the admissions committee could not offer admission for this academic cycle.",
    },
    WITHDRAWN: {
      label: "Application Withdrawn",
      tone: "slate",
      description: "This application has been marked as withdrawn.",
    },
  };

  function getProgressStep(status: string): number {
    switch (status) {
      case "SUBMITTED":
        return 1;
      case "UNDER_REVIEW":
      case "DOCUMENTS_REQUIRED":
        return 2;
      case "TEST_SCHEDULED":
      case "INTERVIEW_SCHEDULED":
      case "DECISION_PENDING":
        return 3;
      case "OFFERED":
      case "FEE_PENDING":
      case "FEE_VERIFICATION":
      case "FEE_VERIFIED":
        return 4;
      case "ENROLLED":
        return 5;
      case "REJECTED":
      case "WITHDRAWN":
        return 4;
      default:
        return 1;
    }
  }

  function getToneClasses(tone: "green" | "amber" | "blue" | "red" | "slate") {
    switch (tone) {
      case "green":
        return {
          badge: "bg-emerald-50 text-emerald-800 border-emerald-200",
          alert: "bg-emerald-50/70 border-emerald-300 text-emerald-950",
          dot: "bg-emerald-600",
        };
      case "amber":
        return {
          badge: "bg-amber-50 text-amber-900 border-amber-200",
          alert: "bg-amber-50/70 border-amber-300 text-amber-950",
          dot: "bg-amber-600",
        };
      case "blue":
        return {
          badge: "bg-blue-50 text-blue-900 border-blue-200",
          alert: "bg-blue-50/70 border-blue-300 text-blue-950",
          dot: "bg-blue-600",
        };
      case "red":
        return {
          badge: "bg-rose-50 text-rose-900 border-rose-200",
          alert: "bg-rose-50/70 border-rose-300 text-rose-950",
          dot: "bg-rose-600",
        };
      default:
        return {
          badge: "bg-slate-100 text-slate-800 border-slate-200",
          alert: "bg-slate-50 border-slate-300 text-slate-900",
          dot: "bg-slate-500",
        };
    }
  }

  const STEP_LABELS = [
    "Application Submitted",
    "Credential Review",
    "Assessment",
    "Admissions Offer",
    "Final Enrollment",
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased"
      style={{ "--site-accent": tenant.accentColor } as CSSProperties}
    >
      {/* Official Academic Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-sm shadow-2xs">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3.5 group">
            {tenant.logoKey.startsWith("http") || tenant.logoKey.startsWith("/") ? (
              <Image
                src={tenant.logoKey}
                alt={tenant.name}
                width={44}
                height={44}
                className="h-10 w-10 rounded-md border border-slate-200 object-contain p-1 bg-white"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white font-serif font-bold text-lg">
                {tenant.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-slate-900 sm:text-base line-clamp-1 group-hover:text-[var(--site-accent)] transition-colors">
                  {tenant.name}
                </span>
                <span className="hidden sm:inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  Admissions
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Admissions &amp; Enrollment Directorate
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 border border-slate-200 text-xs text-slate-600">
              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="font-mono text-slate-700 max-w-[180px] lg:max-w-[240px] truncate">{account.guardianEmail}</span>
            </div>

            <Link
              href="/admissions"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors hidden sm:inline-block"
            >
              Admissions Home
            </Link>

            {studentLoginUrl && (
              <Link
                href={studentLoginUrl}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors hidden md:inline-block"
              >
                Student Login
              </Link>
            )}

            <div className="border-l border-slate-200 pl-2.5 sm:pl-3">
              <ApplicantLogoutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Sub-Banner / Title Strip */}
      <div className="border-b border-slate-200/80 bg-white py-5 sm:py-7">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5 flex-wrap">
            <Link href="/" className="hover:text-slate-700 transition-colors">Home</Link>
            <span>/</span>
            <Link href="/admissions" className="hover:text-slate-700 transition-colors">Admissions</Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Applicant Portal</span>
          </nav>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 font-serif">
              Applicant Status &amp; Enrollment
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-2xl">
              Official applicant portal for tracking evaluation status, testing schedules, and admission confirmation.
            </p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {applications.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-2xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900 font-serif">No Applications on File</h2>
            <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
              No submitted applications were found for <span className="font-medium text-slate-700">{account.guardianEmail}</span>.
              If admissions are currently open, please start a new application.
            </p>
            <div className="mt-6">
              <Link
                href="/admissions"
                className="inline-flex items-center justify-center rounded-md bg-[var(--site-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-2xs hover:opacity-90 transition-opacity"
              >
                Go to Admissions Application
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {applications.map((application) => {
              const applicationDocuments = documents.filter(
                (document) => document.applicationId === application.id,
              );
              const applicationAppointments = appointments.filter(
                (appointment) => appointment.applicationId === application.id,
              );
              const applicationEvents = events.filter(
                (event) => event.applicationId === application.id,
              );
              const feePayment = feePayments.find(
                (payment) => payment.applicationId === application.id,
              );
              const enrollment = enrollments.find(
                (item) => item.applicationId === application.id,
              );

              const statusMeta = STATUS_CONFIG[application.status] || {
                label: application.status,
                tone: "slate" as const,
                description: "Application status currently recorded by admissions office.",
              };
              const toneClasses = getToneClasses(statusMeta.tone);
              const currentStep = getProgressStep(application.status);

              return (
                <article
                  key={application.id}
                  className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden"
                >
                  {/* Application Top Bar Header */}
                  <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] sm:text-xs font-bold tracking-wide uppercase px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-white text-slate-700 border border-slate-200 shadow-2xs">
                          App #{application.applicationNumber}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-semibold border ${toneClasses.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${toneClasses.dot}`} />
                          {statusMeta.label}
                        </span>
                      </div>
                      <h2 className="mt-2 text-lg sm:text-xl lg:text-2xl font-bold tracking-tight text-slate-900 font-serif break-words">
                        {application.studentName}
                      </h2>
                      <p className="mt-0.5 text-xs sm:text-sm text-slate-600 font-medium break-words">
                        {application.offeringTitle} &bull; {application.cycleName}
                      </p>
                    </div>

                    <div className="text-left sm:text-right text-[11px] sm:text-xs text-slate-500 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-slate-200 shrink-0">
                      <div>
                        Submitted:{" "}
                        <time className="font-medium text-slate-700">
                          {new Date(application.submittedAt).toLocaleDateString("en-PK", {
                            timeZone: "Asia/Karachi",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      </div>
                      <div className="mt-0.5 text-slate-400">
                        {new Date(application.submittedAt).toLocaleTimeString("en-PK", {
                          timeZone: "Asia/Karachi",
                          hour: "2-digit",
                          minute: "2-digit",
                        })} PKT
                      </div>
                    </div>
                  </div>

                  {/* Academic Stepper Progress Bar */}
                  <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 sm:mb-4">
                      Application Lifecycle Progress
                    </p>

                    {/* Mobile Step Indicator (< sm) */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">
                          Step {currentStep} of 5:{" "}
                          <span className="font-semibold text-slate-700">
                            {STEP_LABELS[currentStep - 1] || "Review"}
                          </span>
                        </span>
                        <span className="text-[11px] font-bold font-mono text-slate-500">
                          {Math.round((currentStep / 5) * 100)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 w-full">
                        {STEP_LABELS.map((label, idx) => {
                          const stepNum = idx + 1;
                          const isDone = currentStep > stepNum;
                          const isCurrent = currentStep === stepNum;
                          return (
                            <div
                              key={label}
                              className={`h-2 rounded-full transition-all ${
                                isDone
                                  ? "bg-[var(--site-accent)]"
                                  : isCurrent
                                  ? "bg-[var(--site-accent)] ring-2 ring-[var(--site-accent)]/25"
                                  : "bg-slate-200"
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Tablet/Desktop Horizontal Stepper (>= sm) */}
                    <div className="hidden sm:grid sm:grid-cols-5 gap-2 sm:gap-4 relative">
                      {STEP_LABELS.map((label, idx) => {
                        const stepNum = idx + 1;
                        const isDone = currentStep > stepNum;
                        const isCurrent = currentStep === stepNum;

                        return (
                          <div key={label} className="flex flex-col items-center text-center">
                            <div className="flex items-center w-full mb-2">
                              <div
                                className={`h-1 w-full rounded-l ${
                                  idx === 0
                                    ? "bg-transparent"
                                    : isDone || isCurrent
                                    ? "bg-[var(--site-accent)]"
                                    : "bg-slate-200"
                                }`}
                              />
                              <div
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                                  isDone
                                    ? "bg-[var(--site-accent)] text-white"
                                    : isCurrent
                                    ? "border-2 border-[var(--site-accent)] bg-white text-[var(--site-accent)] ring-3 ring-[var(--site-accent)]/15"
                                    : "border border-slate-300 bg-slate-50 text-slate-400"
                                }`}
                              >
                                {isDone ? (
                                  <svg className="h-3.5 w-3.5 stroke-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                ) : (
                                  stepNum
                                )}
                              </div>
                              <div
                                className={`h-1 w-full rounded-r ${
                                  idx === STEP_LABELS.length - 1
                                    ? "bg-transparent"
                                    : isDone
                                    ? "bg-[var(--site-accent)]"
                                    : "bg-slate-200"
                                }`}
                              />
                            </div>
                            <span
                              className={`text-[11px] sm:text-xs leading-tight line-clamp-2 ${
                                isCurrent
                                  ? "font-bold text-slate-900"
                                  : isDone
                                  ? "font-medium text-slate-700"
                                  : "text-slate-400"
                              }`}
                            >
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Two-Column Academic Body */}
                  <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                    {/* Primary Column (2/3 width) - Phase-Driven Progression */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Official Standing Alert Box */}
                      <div className={`rounded-lg border p-5 ${toneClasses.alert}`}>
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 mt-0.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${toneClasses.dot}`} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold tracking-tight">
                              Status: {statusMeta.label}
                            </h3>
                            <p className="mt-1 text-xs sm:text-sm leading-relaxed opacity-90">
                              {statusMeta.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* PHASE 1: ENROLLED */}
                      {enrollment || application.status === "ENROLLED" ? (
                        <section className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4 sm:p-6 shadow-2xs space-y-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-base sm:text-lg font-bold text-emerald-950 font-serif break-words">
                                Congratulations! Admission &amp; Enrollment Confirmed
                              </h3>
                              <p className="text-xs text-emerald-800 break-words">
                                {application.studentName} has been officially registered as an active student.
                              </p>
                            </div>
                          </div>

                          <div className="rounded-md border border-emerald-200 bg-white p-4 sm:p-5 space-y-4">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                Official Student Login ID / Roll Number
                              </p>
                              <p className="mt-1 text-xl sm:text-2xl lg:text-3xl font-mono font-bold tracking-tight text-slate-900 break-all">
                                {enrollment?.loginRollNumber || "Issued by Registrar"}
                              </p>
                            </div>

                            <div className="rounded border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 leading-relaxed">
                              <p className="font-semibold text-slate-800 mb-1">Student Credentials Sent:</p>
                              <p className="break-words">
                                The temporary student password and portal credentials have been dispatched to{" "}
                                <strong className="font-semibold text-slate-900 break-all">{account.guardianEmail}</strong>.
                                The student must log in and change this password on first sign-in.
                              </p>
                            </div>

                            <div className="rounded border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 leading-relaxed">
                              <p className="font-bold text-blue-950 mb-1">Parent Portal Active:</p>
                              <p className="break-words">
                                Your applicant email (<strong className="font-semibold break-all">{account.guardianEmail}</strong>)
                                and admissions password are now your permanent credentials for the Parent Portal.
                              </p>
                            </div>

                            {studentLoginUrl && (
                              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                                <Link
                                  href={studentLoginUrl}
                                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-800 transition-colors w-full sm:w-auto"
                                >
                                  Open Student Login Portal
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                  </svg>
                                </Link>
                                <Link
                                  href="/parent-login"
                                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors w-full sm:w-auto"
                                >
                                  Parent Login Portal
                                </Link>
                              </div>
                            )}

                            {enrollment && (
                              <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3 leading-relaxed">
                                Notice: Applicant portal access will automatically close on{" "}
                                <time className="font-semibold text-slate-600">
                                  {new Date(
                                    new Date(enrollment.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000,
                                  ).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "long" })}
                                </time>{" "}
                                (7 days after enrollment). Afterward, please access student records through the permanent portals.
                              </p>
                            )}
                          </div>
                        </section>
                      ) : (application.status === "OFFERED" ||
                          application.status === "FEE_PENDING" ||
                          application.status === "FEE_VERIFICATION" ||
                          application.status === "FEE_VERIFIED" ||
                          Boolean(feePayment)) ? (
                        /* PHASE 2: ADMISSION OFFER & FEE PAYMENT */
                        feePayment && (
                          <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 shadow-2xs space-y-5">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100">
                              <div>
                                <h3 className="text-base font-bold text-slate-900 font-serif">
                                  Admission Fee Voucher &amp; Seat Confirmation
                                </h3>
                                <p className="text-xs text-slate-500">
                                  Submit fee payment before the due date to secure your enrolled seat.
                                </p>
                              </div>
                              <div>
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-semibold border ${
                                    feePayment.status === "VERIFIED"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : feePayment.status === "REJECTED"
                                      ? "bg-rose-50 text-rose-800 border-rose-200"
                                      : "bg-amber-50 text-amber-800 border-amber-200"
                                  }`}
                                >
                                  Voucher: {feePayment.status}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Payable Amount
                                </p>
                                <p className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-serif break-words">
                                  PKR {feePayment.amount.toLocaleString()}
                                </p>
                              </div>

                              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Payment Due Date
                                </p>
                                <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-900">
                                  {feePayment.dueDate
                                    ? new Date(feePayment.dueDate).toLocaleDateString("en-PK", {
                                        timeZone: "Asia/Karachi",
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                      })
                                    : "As stated on voucher"}
                                </p>
                              </div>
                            </div>

                            {feePayment.bankName && (
                              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs">
                                <p className="font-bold text-slate-800">Bank Deposit / Transfer Details:</p>
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                                  <div>
                                    <span className="text-slate-400">Bank Name:</span>{" "}
                                    <strong className="font-semibold text-slate-800 break-words">{feePayment.bankName}</strong>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Account / IBAN:</span>{" "}
                                    <span className="font-mono font-semibold text-slate-800 break-all">
                                      {feePayment.accountNumber || "N/A"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {feePayment.instructions && (
                              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-600">
                                <p className="font-bold text-slate-800 mb-1">Payment Instructions:</p>
                                <p className="whitespace-pre-line leading-relaxed break-words">{feePayment.instructions}</p>
                              </div>
                            )}

                            {feePayment.reviewerNote && (
                              <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                                <p className="font-bold">Accounts Directorate Note:</p>
                                <p className="mt-0.5 break-words">{feePayment.reviewerNote}</p>
                              </div>
                            )}

                            {application.status === "FEE_PENDING" &&
                              (feePayment.status === "PENDING" || feePayment.status === "REJECTED") && (
                                <div className="border-t border-slate-100 pt-4">
                                  <p className="text-xs font-bold text-slate-800 mb-2">
                                    Complete Online Fee Payment:
                                  </p>
                                  <ApplicantFeePayment
                                    applicationId={application.id}
                                    accentColor={tenant.accentColor}
                                    gateways={[]}
                                  />
                                </div>
                              )}
                          </section>
                        )
                      ) : (application.status === "TEST_SCHEDULED" ||
                          application.status === "INTERVIEW_SCHEDULED" ||
                          applicationAppointments.length > 0) ? (
                        /* PHASE 3: ASSESSMENT / INTERVIEW */
                        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 shadow-2xs space-y-4">
                          <div className="pb-4 border-b border-slate-100">
                            <h3 className="text-base font-bold text-slate-900 font-serif">
                              Entry Assessment &amp; Interview Schedule
                            </h3>
                            <p className="text-xs text-slate-500">
                              Your appointment details for admission evaluation.
                            </p>
                          </div>

                          <div className="space-y-4">
                            {applicationAppointments.map((appointment) => (
                              <div
                                key={appointment.id}
                                className="rounded-md border border-slate-200 bg-slate-50 p-4 sm:p-5"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <h4 className="text-sm font-bold text-slate-900">
                                    {appointment.type === "TEST" ? "Official Admission Test" : "Admissions Interview"}
                                  </h4>
                                  <span className="inline-flex items-center rounded bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                                    Scheduled
                                  </span>
                                </div>

                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-slate-500">Date &amp; Time:</span>
                                    <p className="mt-0.5 font-semibold text-slate-800">
                                      {new Date(appointment.scheduledAt).toLocaleString("en-PK", {
                                        timeZone: "Asia/Karachi",
                                        dateStyle: "full",
                                        timeStyle: "short",
                                      })}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-slate-500">Reporting Venue:</span>
                                    <p className="mt-0.5 font-semibold text-slate-800 break-words">
                                      {appointment.location || "To be communicated by SMS/Email"}
                                    </p>
                                  </div>
                                </div>

                                {appointment.instructions && (
                                  <div className="mt-3 border-t border-slate-200/80 pt-3 text-xs text-slate-600">
                                    <span className="font-bold text-slate-700">Instructions: </span>
                                    <span className="break-words">{appointment.instructions}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : (applicationDocuments.some(
                          (d) => d.status === "REQUESTED" || d.status === "REJECTED",
                        ) || application.status === "DOCUMENTS_REQUIRED") &&
                        applicationDocuments.length > 0 ? (
                        /* PHASE 4: DOCUMENTS REQUIRED (Only shown while pending/rejected documents exist) */
                        <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6 shadow-2xs space-y-4">
                          <div className="pb-4 border-b border-slate-100">
                            <h3 className="text-base font-bold text-slate-900 font-serif">
                              Required Documents for Verification
                            </h3>
                            <p className="text-xs text-slate-500">
                              Upload the requested documents. Once verified by the admissions office, you will progress to the next phase.
                            </p>
                          </div>

                          <ul className="divide-y divide-slate-100">
                            {applicationDocuments
                              .filter((d) => d.status === "REQUESTED" || d.status === "REJECTED")
                              .map((document) => (
                                <li key={document.id} className="py-4 first:pt-0 last:pb-0">
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900 break-words">
                                          {document.documentName}
                                        </span>
                                        <span
                                          className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold border ${
                                            document.status === "REJECTED"
                                              ? "bg-rose-50 text-rose-800 border-rose-200"
                                              : "bg-amber-50 text-amber-800 border-amber-200"
                                          }`}
                                        >
                                          {document.status === "REJECTED" ? "Rejected - Re-upload" : "Upload Required"}
                                        </span>
                                      </div>
                                      {document.instructions && (
                                        <p className="mt-1 text-xs text-slate-500 leading-relaxed break-words">
                                          {document.instructions}
                                        </p>
                                      )}
                                      {document.reviewerNote && (
                                        <p className="mt-2 text-xs font-medium text-rose-700 bg-rose-50 p-2.5 rounded border border-rose-100 break-words">
                                          Note: {document.reviewerNote}
                                        </p>
                                      )}
                                    </div>

                                    <div className="sm:shrink-0 w-full sm:w-auto">
                                      <ApplicantDocumentUpload
                                        documentId={document.id}
                                        accentColor={tenant.accentColor}
                                      />
                                    </div>
                                  </div>
                                </li>
                              ))}
                          </ul>
                        </section>
                      ) : application.status === "REJECTED" ? (
                        /* PHASE 5: REJECTED */
                        <section className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 sm:p-6 shadow-2xs">
                          <h3 className="text-base font-bold text-rose-950 font-serif">
                            Admissions Decision: Not Selected
                          </h3>
                          <p className="mt-2 text-xs sm:text-sm text-rose-900 leading-relaxed">
                            Following review by the admissions committee, your application could not be selected for this cycle.
                          </p>
                        </section>
                      ) : (
                        /* PHASE 6: DEFAULT UNDER REVIEW */
                        <section className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 text-center shadow-2xs space-y-3">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-bold text-slate-900 font-serif">
                            Application Under Review
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                            Your application is being evaluated by the admissions committee.
                            Once documents are verified or an assessment is scheduled, your next step will appear here.
                          </p>
                        </section>
                      )}
                    </div>

                    {/* Sidebar / Info Column (1/3 width) */}
                    <div className="space-y-6">
                      {/* Candidate Profile Summary */}
                      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-3 border-b border-slate-100">
                          Candidate Profile
                        </h3>
                        <dl className="mt-4 space-y-3.5 text-xs">
                          <div>
                            <dt className="text-slate-400">Applicant Full Name</dt>
                            <dd className="mt-0.5 font-bold text-slate-900 text-sm font-serif break-words">
                              {application.studentName}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-400">Campus</dt><dd className="font-semibold text-slate-800">{application.campusName}</dd>
                            <dt className="text-slate-400">Application Number</dt>
                            <dd className="mt-0.5 font-mono font-bold text-slate-900 break-all">
                              #{application.applicationNumber}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-400">Applied Degree / Program</dt>
                            <dd className="mt-0.5 font-semibold text-slate-800 break-words">
                              {application.offeringTitle}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-400">Admission Cycle</dt>
                            <dd className="mt-0.5 font-medium text-slate-700 break-words">
                              {application.cycleName}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-400">Registered Email</dt>
                            <dd className="mt-0.5 font-mono text-slate-700 break-all">
                              {account.guardianEmail}
                            </dd>
                          </div>
                        </dl>
                      </section>

                      {/* Admissions Office Helpdesk */}
                      <section className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-3 border-b border-slate-100">
                          Admissions Directorate
                        </h3>
                        <p className="mt-3 text-xs text-slate-600 leading-relaxed">
                          For queries regarding quotas, eligibility criteria, or technical portal issues:
                        </p>

                        <div className="mt-4 space-y-3 text-xs">
                          {tenant.publicAddress && (
                            <div className="flex items-start gap-2.5">
                              <svg className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                              <span className="text-slate-700">{tenant.publicAddress}</span>
                            </div>
                          )}

                          {tenant.publicPhone && (
                            <div className="flex items-center gap-2.5">
                              <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                              </svg>
                              <span className="font-semibold text-slate-800">{tenant.publicPhone}</span>
                            </div>
                          )}

                          {tenant.publicEmail && (
                            <div className="flex items-center gap-2.5">
                              <svg className="h-4 w-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                              </svg>
                              <span className="font-mono text-slate-700">{tenant.publicEmail}</span>
                            </div>
                          )}

                          <div className="border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                            Office Hours: Monday – Friday, 9:00 AM – 4:00 PM PKT
                          </div>
                        </div>
                      </section>

                      {/* Important University Notices */}
                      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:p-5 text-xs text-slate-600 shadow-2xs">
                        <h4 className="font-bold text-slate-800 mb-2">Important Instructions</h4>
                        <ul className="list-disc list-inside space-y-1.5 leading-relaxed text-slate-500">
                          <li>All provisional admissions are subject to physical verification of original academic records.</li>
                          <li>Keep your official application number handy for all correspondence.</li>
                          <li>Fee payments made after the voucher due date will not secure quota or seats.</li>
                        </ul>
                      </section>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

async function TenantAdmissionsPage({
  tenant,
  studentLoginUrl,
}: {
  tenant: PublicInstitutionTenant;
  studentLoginUrl: string;
}) {
  const [cycle] = tenant.admissionsEnabled
    ? await db
        .select()
        .from(admissionCycles)
        .where(
          and(
            eq(admissionCycles.institutionId, tenant.id),
            eq(admissionCycles.status, "OPEN"),
            openAdmissionCampusExistsSql(admissionCycles.id, sql`${tenant.id}`),
            sql`(${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${admissionToday})`,
            sql`(${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${admissionToday})`,
          ),
        )
        .limit(1)
    : [];

  const campuses = cycle ? await listOpenAdmissionCampuses(tenant.id, cycle.id) : [];
  const offerings = cycle
    ? await db
        .select({
          id: admissionOfferings.id,
          title: admissionOfferings.title,
          description: admissionOfferings.description,
        })
        .from(admissionOfferings)
        .where(
          and(
            eq(admissionOfferings.institutionId, tenant.id),
            eq(admissionOfferings.cycleId, cycle.id),
            eq(admissionOfferings.isActive, true),
          ),
        )
    : [];

  return (
    <div
      className="min-h-screen bg-[#f2efe7] text-[#171c1a]"
      style={{ "--site-accent": tenant.accentColor } as CSSProperties}
    >
      <header className="border-b border-black/10">
        <div className="mx-auto flex h-[78px] max-w-[1440px] items-center justify-between gap-4 border-x border-black/10 px-5 sm:px-8">
          <Link
            href="/"
            className="font-display text-base font-semibold sm:text-lg"
          >
            {tenant.name}
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href={studentLoginUrl}
              className="text-xs font-semibold text-black/45 hover:text-black"
            >
              Student login
            </Link>
            <Link
              href="/admissions/login"
              className="text-xs font-bold text-[var(--site-accent)]"
            >
              Applicant login
            </Link>
            <Link
              href="/"
              className="hidden text-xs font-semibold text-black/45 hover:text-black sm:block"
            >
              Institution website
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <section className="bg-[var(--site-accent)] text-white">
          <div className="mx-auto max-w-[1440px] border-x border-white/15 px-6 py-14 sm:px-10 sm:py-20 lg:px-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
              Admissions / {cycle?.academicYear || "Information"}
            </p>
            <h1 className="mt-5 max-w-5xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-6xl">
              Apply to {tenant.name}
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-7 text-white/65">
              Submit one accurate application for each student. After
              submission, use the applicant portal to follow every next step.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-[1440px] border-x border-black/10">
          {!cycle || offerings.length === 0 || campuses.length === 0 ? (
            <section className="px-6 py-16 sm:px-10 lg:px-14">
              <div className="max-w-2xl border-l-2 border-[var(--site-accent)] bg-[#fbf9f4] p-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-black/40">
                  Current status
                </p>
                <h2 className="mt-4 font-display text-3xl font-semibold">
                  Applications are currently closed
                </h2>
                <p className="mt-4 leading-7 text-black/55">
                  Please check this page again when the institution announces
                  its next admission cycle.
                </p>
              </div>
            </section>
          ) : (
            <div className="grid lg:grid-cols-[0.38fr_0.62fr]">
              <aside className="border-b border-black/10 bg-[#e9e5dc] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--site-accent)]">
                  Current admission round
                </p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]">
                  {cycle.name}
                </h2>
                <p className="mt-2 text-sm text-black/45">
                  Academic year {cycle.academicYear}
                </p>
                {cycle.instructions && (
                  <p className="mt-7 whitespace-pre-line border-t border-black/10 pt-6 text-sm leading-7 text-black/60">
                    {cycle.instructions}
                  </p>
                )}
                {(cycle.requiresTest || cycle.requiresInterview) && (
                  <div className="mt-7 border-t border-black/10 pt-6 text-sm leading-6">
                    {cycle.requiresTest && (
                      <p className="border-b border-black/10 py-3">
                        Physical admission test required
                      </p>
                    )}
                    {cycle.requiresInterview && (
                      <p className="border-b border-black/10 py-3">
                        Interview required
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-8">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-black/40">
                    Available programs or classes
                  </p>
                  <ul className="mt-3 border-t border-black/10">
                    {offerings.map((offering) => (
                      <li
                        key={offering.id}
                        className="border-b border-black/10 py-4"
                      >
                        <p className="font-display text-lg font-semibold">
                          {offering.title}
                        </p>
                        {offering.description && (
                          <p className="mt-1 text-sm leading-6 text-black/50">
                            {offering.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
              <section className="bg-[#fbf9f4] p-6 sm:p-10 lg:p-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--site-accent)]">
                  Application form
                </p>
                <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]">
                  Student information
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
                  Enter details exactly as they appear on official documents.
                  The institution will contact the parent or guardian about the
                  next step.
                </p>
                <div className="mt-6">
                  <AdmissionIntakeForms
                    institution={{
                      name: tenant.name,
                      logoUrl:
                        tenant.logoKey.startsWith("http") ||
                        tenant.logoKey.startsWith("/")
                          ? tenant.logoKey
                          : null,
                      address: tenant.publicAddress,
                      phone: tenant.publicPhone,
                      email: tenant.publicEmail,
                    }}
                    cycle={{
                      name: cycle.name,
                      academicYear: cycle.academicYear,
                      instructions: cycle.instructions,
                      requiredDocuments: cycle.requiredDocuments,
                      requiresTest: cycle.requiresTest,
                      testDate: cycle.testScheduledAt
                        ? new Date(cycle.testScheduledAt).toLocaleString(
                            "en-PK",
                            { timeZone: "Asia/Karachi" },
                          )
                        : null,
                      testLocation: cycle.testLocation,
                      testInstructions: cycle.testInstructions,
                      requiresInterview: cycle.requiresInterview,
                      interviewDate: cycle.interviewScheduledAt
                        ? new Date(cycle.interviewScheduledAt).toLocaleString(
                            "en-PK",
                            { timeZone: "Asia/Karachi" },
                          )
                        : null,
                      interviewLocation: cycle.interviewLocation,
                      interviewInstructions: cycle.interviewInstructions,
                      admissionFeeAmount: cycle.admissionFeeAmount,
                      admissionFeeDueDays: cycle.admissionFeeDueDays,
                      admissionFeeInstructions: cycle.admissionFeeInstructions,
                      paymentBankName: cycle.paymentBankName,
                      paymentAccountNumber: cycle.paymentAccountNumber,
                      paymentQrUrl: cycle.paymentQrUrl,
                    }}
                    offerings={offerings}
                    campuses={campuses}
                    today={admissionCalendarDate()}
                    accentColor={tenant.accentColor}
                  />
                </div>

              </section>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
