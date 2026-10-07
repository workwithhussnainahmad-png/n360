import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, Star } from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { pricingPlans } from "@/lib/pricing";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare Nisaab360 pricing for small schools, growing schools, and large institutions in Pakistan.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Nisaab360 pricing for every stage of growth",
    description:
      "Simple setup and monthly pricing for schools and large educational institutions.",
    url: "https://nisaab360.app/pricing",
    type: "website",
  },
};

export default function PricingPage() {
  return (
    <div className={styles.page}>
      <LandingHeader />

      <main>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Pricing / Pakistan</p>
            <h1>
              Clear pricing.
              <span>Room to grow.</span>
            </h1>
          </div>
          <div className={styles.heroSide}>
            <p>
              Choose the plan that matches your institution today. Each plan combines a
              a one-time setup fee, straightforward monthly billing, and a student range that is easy to understand.
            </p>
            <div className={styles.heroPrice}>
              <span>Monthly plans from</span>
              <strong>Rs. 3,500</strong>
              <small>for up to 300 students</small>
            </div>
          </div>
        </section>

        <section className={styles.plansSection} id="plans">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Choose your plan</p>
              <h2>Built for every stage of your institution.</h2>
            </div>
            <p>All prices are in Pakistani rupees.</p>
          </div>

          <div className={styles.planGrid}>
            {pricingPlans.map((plan, index) => (
              <article
                className={`${styles.planCard} ${plan.featured ? styles.featuredPlan : ""}`}
                data-tone={plan.tone}
                key={plan.name}
              >
                <div className={styles.planTopline}>
                  <span className={styles.planIndex}>0{index + 1}</span>
                  {plan.featured ? (
                    <span className={styles.popularBadge}>
                      <Star size={11} fill="currentColor" />
                      Most selected
                    </span>
                  ) : (
                    <span className={styles.planDot} aria-hidden="true" />
                  )}
                </div>

                <div className={styles.planName}>
                  <p>{plan.audience}</p>
                  <h3>{plan.name}</h3>
                </div>

                <div className={styles.monthlyPrice}>
                  <span>Monthly</span>
                  <strong>{plan.monthly}</strong>
                  <small>{plan.monthlyDetail}</small>
                </div>

                <div className={styles.setupPrice}>
                  <span>One-time setup</span>
                  <strong>{plan.setup}</strong>
                </div>

                <ul>
                  <li><Check size={15} />{plan.campusDetail}</li>
                  <li>
                    <Check size={15} />
                    Clear monthly pricing
                  </li>
                  <li>
                    <Check size={15} />
                    {plan.scale}
                  </li>
                  <li>
                    <Check size={15} />
                    Nisaab360 platform access
                  </li>
                </ul>

                <Link href={`/register?plan=${plan.id.toLowerCase()}`}>
                  Choose {plan.name}
                  <ArrowUpRight size={15} />
                </Link>
              </article>
            ))}
          </div>

        </section>

        <section className={styles.billingSection}>
          <div className={styles.billingHeading}>
            <p className={styles.eyebrow}>At a glance</p>
            <h2>No complicated pricing formula.</h2>
          </div>
          <div className={styles.billingRows}>
            {pricingPlans.map((plan) => (
              <div key={plan.id}>
                <span>{plan.name}</span>
                <p>{plan.monthly} per month — {plan.scale}.</p>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>Ready when you are</p>
          <h2>Bring your school into one connected system.</h2>
          <div>
            <Link href="/register">
              Request institution access
              <ArrowRight size={17} />
            </Link>
            <Link href="/#platform">Explore the platform</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/">Nisaab360</Link>
        <p>One system for the work between the bells.</p>
        <div>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Register</Link>
        </div>
      </footer>
    </div>
  );
}
