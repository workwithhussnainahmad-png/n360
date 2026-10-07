export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  MessageCircle,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  featuredInstitutions,
  institutions,
  platformReviews,
} from "@/db/schema";
import { getCachedOrFetch } from "@/lib/redis";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { LandingMotion } from "@/components/landing/LandingMotion";
import { WebsiteDestroyer } from "@/components/landing/WebsiteDestroyer";
import { ModelScene } from "@/components/landing/ModelScene";
import { pricingPlans } from "@/lib/pricing";
import styles from "./landing.module.css";

const landingModels = {
  laptop: "/models/laptop.50fa717d47.glb",
  building: "/models/building_d_agu_sagamihara_campus_lod2-3.f240804181.glb",
  phone: "/models/smart_phone.efa7dcbf71.glb",
  cap: "/models/graduation_hat.3c669d375f.glb",
} as const;

export const metadata: Metadata = {
  title: "Nisaab360 | School Management and LMS Pakistan",
  description:
    "Nisaab360 connects school administration, attendance, academics, communication, and reporting in one Pakistani education platform.",
  keywords: [
    "Nisaab360",
    "Pakistani LMS",
    "school management software Pakistan",
    "school ERP",
    "education management system",
  ],
  openGraph: {
    title: "Nisaab360 | One system for the work between the bells",
    description:
      "A connected operating system for school administration, academics, attendance, and communication.",
    type: "website",
    url: "https://nisaab360.app",
    siteName: "Nisaab360",
  },
};

async function getLandingData() {
  // Shared public content only; existing cache coordinates fills across replicas.
  return getCachedOrFetch("cache:public:landing:v1", 300, async () => {
    const [featuredLogos, latestReviews] = await Promise.all([
      db
        .select({
          id: featuredInstitutions.id,
          name: featuredInstitutions.name,
          logoKey: featuredInstitutions.logoKey,
        })
        .from(featuredInstitutions)
        .orderBy(desc(featuredInstitutions.createdAt))
        .limit(7),
      db
        .select({
          id: platformReviews.id,
          rating: platformReviews.rating,
          content: platformReviews.content,
          institutionName: institutions.name,
          logoKey: institutions.logoKey,
          city: institutions.city,
          country: institutions.country,
        })
        .from(platformReviews)
        .innerJoin(institutions, eq(platformReviews.institutionId, institutions.id))
        .orderBy(desc(platformReviews.createdAt))
        .limit(3),
    ]);
    return { featuredLogos, latestReviews };
  });
}

export default async function LandingPage() {
  const { featuredLogos, latestReviews } = await getLandingData();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nisaab360",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web, Android",
    description:
      "A Pakistani learning and school management platform for administration, academics, and communication.",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "PKR",
      lowPrice: "3000",
      offerCount: "3",
    },
  };

  return (
    <div className={styles.page} data-landing-page>
      <LandingMotion />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingHeader />
      <WebsiteDestroyer />

      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.overline} data-reveal>
              School management &amp; learning, connected
            </p>
            <h1 data-reveal>
              Your school has enough moving parts.
              <span>The system shouldn&apos;t add more.</span>
            </h1>
            <p className={styles.heroLead} data-reveal>
              Nisaab360 brings daily administration, classroom work, attendance, results,
              and communication into one place your team can actually understand.
            </p>
            <div className={styles.heroActions} data-reveal>
              <Link href="/register" className={styles.darkButton}>
                Request institution access
                <ArrowRight size={16} />
              </Link>
              <Link href="/login" className={styles.textLink}>
                Sign in to your portal
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>

          <div className={styles.heroObject} data-reveal>
            <span className={styles.objectCaption}>01 / The product</span>
            <ModelScene
              model={landingModels.laptop}
              preset="laptop"
              label="Loading product model"
              eager
              preloadNext={landingModels.building}
            />
          </div>

          <div className={styles.heroFoot} data-reveal>
            <div>
              <strong>Manage</strong>
              <span>People, fees &amp; attendance</span>
            </div>
            <div>
              <strong>Teach</strong>
              <span>Classes, assignments &amp; tests</span>
            </div>
            <div>
              <strong>Connect</strong>
              <span>Staff, students &amp; parents</span>
            </div>
            <p>Daily school work, in one connected platform.</p>
          </div>
        </section>

        {featuredLogos.length > 0 && (
          <section className={styles.institutionStrip}>
            <p>Institutions growing with Nisaab360</p>
            <div>
              {featuredLogos.map((institution) => (
                <span className={styles.institution} key={institution.id}>
                  {institution.logoKey && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={institution.logoKey} alt="" />
                  )}
                  {institution.name}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className={styles.campusSection} id="platform">
          <div className={styles.chapterCopy}>
            <p className={styles.chapterNumber}>02</p>
            <p className={styles.overline}>The institution view</p>
            <h2>Know what is happening before someone has to ask.</h2>
            <p className={styles.chapterLead}>
              The morning should not begin with five spreadsheets and a trail of messages.
              Nisaab360 gives administrators a shared picture of the day.
            </p>
            <div className={styles.rules}>
              {[
                ["Attendance", "See student and staff presence as it is recorded."],
                ["Timetables", "Keep sections, subjects, and teaching assignments aligned."],
                ["Administration", "Manage campuses, people, records, and fees together."],
              ].map(([title, copy]) => (
                <div className={styles.rule} key={title}>
                  <strong>{title}</strong>
                  <span>{copy}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.campusObject} data-reveal>
            <span className={styles.objectCaption}>02 / The institution</span>
            <div className={styles.campusModelIntro}>
              <p>From the front office to every classroom.</p>
              <div>
                <span>
                  <small>Campuses</small>
                  <strong>One operational view</strong>
                </span>
                <span>
                  <small>People</small>
                  <strong>Students and staff</strong>
                </span>
                <span>
                  <small>Academics</small>
                  <strong>Classes and results</strong>
                </span>
              </div>
            </div>
            <ModelScene
              model={landingModels.building}
              preset="building"
              label="Loading campus model"
              preloadNext={landingModels.phone}
            />
          </div>
        </section>

        <section className={styles.productSection}>
          <div className={styles.productIntro} data-reveal>
            <p className={styles.overline}>One operational view</p>
            <h2>A dashboard that answers a question, not one that creates ten more.</h2>
            <p>
              The interface follows the structure of your institution, so data remains
              connected from campus to class to student.
            </p>
          </div>

          <div className={styles.productWindow} data-reveal>
            <div className={styles.windowBar}>
              <span>Nisaab360 / Demo Academy</span>
              <span>Sample data</span>
            </div>
            <div className={styles.windowBody}>
              <aside aria-hidden="true">
                <strong>N360</strong>
                {["Overview", "Students", "Staff", "Academics", "Attendance", "Results"].map(
                  (item) => (
                    <span key={item}>{item}</span>
                  ),
                )}
              </aside>
              <div className={styles.windowContent}>
                <div className={styles.windowHeading}>
                  <div>
                    <p>Institution overview</p>
                    <h3>Good morning.</h3>
                  </div>
                  <span>Current academic session</span>
                </div>
                <div className={styles.metricRow}>
                  <div>
                    <span>Students</span>
                    <strong>480</strong>
                  </div>
                  <div>
                    <span>Classes</span>
                    <strong>24</strong>
                  </div>
                  <div>
                    <span>Tests recorded</span>
                    <strong>36</strong>
                  </div>
                  <div>
                    <span>Attendance</span>
                    <strong>96%</strong>
                  </div>
                </div>
                <div className={styles.activityGrid}>
                  <div className={styles.activityChart}>
                    <p>Academic activity</p>
                    <div className={styles.chartLines}>
                      {[44, 62, 48, 76, 67, 86, 72, 92, 80].map((height, index) => (
                        <i key={index} style={{ height: `${height}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className={styles.todayList}>
                    <p>Today</p>
                    {[
                      ["Attendance", "Recorded"],
                      ["Timetable", "In progress"],
                      ["Announcements", "Delivered"],
                    ].map(([name, state]) => (
                      <div key={name}>
                        <span>{name}</span>
                        <strong>{state}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.phoneSection} id="features">
          <div className={styles.phoneCopy}>
            <p className={styles.chapterNumber}>03</p>
            <p className={styles.overline}>Communication</p>
            <h2>The update reaches the right people. The first time.</h2>
            <p className={styles.chapterLead}>
              Announcements can be directed by institution, role, class, or section.
              Students and staff carry the same current information in the Nisaab360 app.
            </p>
            <ul className={styles.simpleList}>
              <li>
                <MessageCircle size={18} />
                Targeted announcements
              </li>
              <li>
                <ShieldCheck size={18} />
                Role-aware access
              </li>
              <li>
                <Users size={18} />
                Student and staff portals
              </li>
            </ul>
          </div>
          <div className={styles.phoneObject} data-reveal>
            <span className={styles.objectCaption}>03 / The mobile experience</span>
            <ModelScene
              model={landingModels.phone}
              preset="phone"
              label="Loading phone model"
              preloadNext={landingModels.cap}
            />
            <div className={styles.phoneModelNotes}>
              <div>
                <span>01 / Announcements</span>
                <strong>Right audience, instantly.</strong>
              </div>
              <div>
                <span>02 / Attendance</span>
                <strong>Daily status at a glance.</strong>
              </div>
              <div>
                <span>03 / Results</span>
                <strong>Published in one place.</strong>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.academicSection}>
          <div className={styles.academicCopy}>
            <p className={styles.chapterNumber}>04</p>
            <p className={styles.overline}>Academic continuity</p>
            <h2>A student&apos;s progress should read like one story.</h2>
            <p className={styles.chapterLead}>
              Tests, marks, attendance, assignments, and published results remain attached
              to the same academic record—from the first class to the final transcript.
            </p>
            <div className={styles.academicSteps}>
              {[
                [CalendarDays, "Plan", "Classes, subjects, timetables"],
                [ClipboardCheck, "Assess", "Tests, marks, published results"],
                [BookOpen, "Review", "History, performance, transcripts"],
              ].map(([Icon, title, copy]) => {
                const StepIcon = Icon as typeof CalendarDays;
                return (
                  <div key={String(title)}>
                    <StepIcon size={19} />
                    <strong>{String(title)}</strong>
                    <span>{String(copy)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.capObject} data-reveal>
            <span className={styles.objectCaption}>04 / The academic record</span>
            <ModelScene
              model={landingModels.cap}
              preset="cap"
              label="Loading graduation model"
            />
          </div>
        </section>

        {latestReviews.length > 0 && (
          <section className={styles.reviewSection} id="testimonials">
            <div className={styles.reviewIntro}>
              <p className={styles.overline}>From institutions</p>
              <h2>Used by the people responsible for keeping the day moving.</h2>
            </div>
            <div className={styles.reviewList}>
              {latestReviews.map((review, reviewIndex) => (
                <article key={review.id} data-reveal>
                  <span className={styles.reviewIndex}>0{reviewIndex + 1}</span>
                  <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        size={13}
                        fill={index < review.rating ? "currentColor" : "none"}
                        opacity={index < review.rating ? 1 : 0.2}
                      />
                    ))}
                  </div>
                  <blockquote>&ldquo;{review.content}&rdquo;</blockquote>
                  <footer>
                    {review.logoKey ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={review.logoKey} alt="" />
                    ) : (
                      <span>{review.institutionName.slice(0, 1)}</span>
                    )}
                    <div>
                      <strong>{review.institutionName}</strong>
                      <small>{[review.city, review.country].filter(Boolean).join(", ")}</small>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.pricingIntro}>
            <p className={styles.overline}>Pricing</p>
            <h2>A plan that fits the school you are building.</h2>
            <p>
              Choose the monthly plan that fits your current student count, with a custom
              option for large multi-campus institutions.
            </p>
            <Link href="/pricing" className={styles.pricingPageLink}>
              Explore full pricing
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className={styles.priceTable}>
            <div className={styles.priceHeader}>
              <span>Plan</span>
              <span>Price / month</span>
              <span>Setup fee</span>
              <span>Student range</span>
              <span />
            </div>
            {pricingPlans.map((plan) => (
              <div
                className={`${styles.priceRow} ${plan.featured ? styles.featuredPrice : ""}`}
                key={plan.name}
              >
                <strong>
                  {plan.name}
                  <small>{plan.featured ? "Most selected" : plan.audience}</small>
                </strong>
                <span>
                  <b>{plan.monthly}</b>
                  <small>{plan.monthlyDetail}</small>
                </span>
                <span>
                  <b>{plan.setup}</b>
                  <small>one time</small>
                </span>
                <span>
                  <b>{plan.scale}</b>
                </span>
                <Link href={`/register?plan=${plan.id.toLowerCase()}`}>
                  Choose {plan.name}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <p>Ready when your institution is.</p>
          <h2>See Nisaab360 with your own workflow in mind.</h2>
          <Link href="/register">
            Request institution access
            <ArrowRight size={17} />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerBrand}>
            <Image src="/Logo.png" alt="Nisaab360" width={36} height={36} />
            <strong>Nisaab360</strong>
            <p>One system for the work between the bells.</p>
            <a
              href="https://saasbrowser.com/en/saas/1591437/nisaab360"
              target="_blank"
              rel="noopener"
              className={styles.verifiedBadge}
            >
              {/* External verification badge is hosted by SaaSBrowser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://files.saasbrowser.com/xlnuotdo3wchj3kcdggnnx8kl7ts"
                alt="Nisaab360 - B2B software directory verified badge"
                width="200"
                height="133"
              />
            </a>
          </div>
          <nav>
            <p>Platform</p>
            <Link href="#platform">Institution view</Link>
            <Link href="#features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/download-app">Mobile app</Link>
            <Link href="/download-software">Software</Link>
          </nav>
          <nav>
            <p>Access</p>
            <Link href="/login">Student &amp; staff</Link>
            <Link href="/institution-login">Institution</Link>
            <Link href="/parent-login">Parent</Link>
            <Link href="/employee-login">Employee</Link>
            <Link href="/register">Register</Link>
          </nav>
          <nav>
            <p>Company</p>
            <Link href="/about-us">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms-of-service">Terms</Link>
          </nav>
        </div>
        <div className={styles.footerMeta}>
          <span>© {new Date().getFullYear()} Nisaab360</span>
          <p>
            CC BY 4.0 models:{" "}
            <a href="https://sketchfab.com/3d-models/laptop-7d870e900889481395b4a575b9fa8c3e">
              Laptop / Aullwen
            </a>
            ,{" "}
            <a href="https://sketchfab.com/3d-models/building-d-agu-sagamihara-campus-lod2-3-0281566e7062442fa5306fe9fe811adc">
              Building D / ibukilego
            </a>
            ,{" "}
            <a href="https://sketchfab.com/3d-models/smart-phone-6e58ca1109dc4c1eaba131ec5151ec5c">
              Phone / James.Lutt
            </a>
            ,{" "}
            <a href="https://sketchfab.com/3d-models/graduation-hat-b0a7e821403b4c8cb8e1d32ea4075eac">
              Graduation Hat / Delo
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
