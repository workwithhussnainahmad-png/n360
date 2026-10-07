import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { FaqAccordion, FaqItemData } from "./FaqAccordion";
import styles from "./faq.module.css";

export const metadata: Metadata = {
  title: "Frequently Asked Questions (FAQ) | Nisaab360",
  description:
    "Explore answers to the most frequently searched questions regarding Nisaab360 Learning Management System, school ERP, Pakistani payment gateways, admissions, attendance, and exam management.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "Nisaab360 FAQ | One System for Pakistani Education",
    description:
      "Comprehensive answers about admissions, online fee vouchers, attendance, exams, and institutional management.",
    url: "https://nisaab360.app/faq",
    type: "website",
  },
};

const FAQ_ITEMS: FaqItemData[] = [
  // Category 1: General & Architecture (1 to 5)
  {
    id: "what-is-nisaab360",
    category: "general",
    categoryLabel: "General & Roles",
    question: "What is an LMS and what makes Nisaab360 unique for schools in Pakistan?",
    answer: (
      <>
        A <strong>Learning Management System (LMS)</strong> combined with a School ERP is an integrated digital operating system that unifies school operations, academics, communication, and financial management. <strong>Nisaab360</strong> is uniquely designed ground-up for Pakistani educational environments: featuring native PKR currency handling, local payment gateways (<strong>Easypaisa, JazzCash, and HBL Pay</strong>), Pakistani academic cycle workflows, Matric/Intermediate/Cambridge grading standards, and automated SMS alerts.
      </>
    ),
  },
  {
    id: "user-roles-portals",
    category: "general",
    categoryLabel: "General & Roles",
    question: "Who can use Nisaab360 and what portals are available?",
    answer: (
      <>
        Nisaab360 provides <strong>5 specialized, role-based portals</strong>:
        <ul className="mt-2 list-disc list-inside space-y-1.5 text-slate-700">
          <li><strong>Institution Admin Portal:</strong> Manage students, faculty, fee structures, admissions cycles, and campus settings.</li>
          <li><strong>Teacher &amp; Staff Portal:</strong> Record daily attendance, publish digital diaries, grade exams, and manage lecture pacing.</li>
          <li><strong>Student Portal:</strong> Access course timetables, watch recorded lectures, submit tests, and review report cards.</li>
          <li><strong>Parent Portal:</strong> Monitor child attendance, view daily homework diaries, check fee vouchers, and pay online.</li>
          <li><strong>Super Admin / Support Portal:</strong> Institutional onboarding, data backup management, and platform health.</li>
        </ul>
      </>
    ),
  },
  {
    id: "multi-campus-support",
    category: "general",
    categoryLabel: "General & Roles",
    question: "Can Nisaab360 support multiple branches or school networks under one account?",
    answer: (
      <>
        <strong>Yes.</strong> Nisaab360 natively supports multi-campus school chains. Central administration can govern multiple campuses under a single master organization while delegating campus-specific authority for teachers, timetables, section capacities, and fees. Consolidated executive dashboards provide network-wide metrics on student enrollments, fee recovery, and academic standings across all branches.
      </>
    ),
  },
  {
    id: "branded-school-website",
    category: "general",
    categoryLabel: "General & Roles",
    question: "Does Nisaab360 provide our school with its own branded public website?",
    answer: (
      <>
        <strong>Yes.</strong> Every registered institution on Nisaab360 receives an automated, modern public website hosted at <code>/sites/[your-school-slug]</code> or on your own custom domain. Schools can customize institutional brand colors, upload crests and logos, announce events, showcase academic offerings, and allow prospective candidates to apply online.
      </>
    ),
  },
  {
    id: "devices-and-apps",
    category: "general",
    categoryLabel: "General & Roles",
    question: "What devices and browsers can access Nisaab360?",
    answer: (
      <>
        Nisaab360 is completely web-based and responsive across all devices—including desktop computers, laptops, iPads/tablets, and mobile phones on Chrome, Safari, Firefox, and Edge. We also provide dedicated <strong>Android &amp; iOS mobile apps</strong> for parents and teachers, alongside downloadable software utilities for institutional offices.
      </>
    ),
  },

  // Category 2: Admissions & Student Records (6 to 10)
  {
    id: "online-admissions-process",
    category: "admissions",
    categoryLabel: "Admissions",
    question: "How does the online student admission pipeline work in Nisaab360?",
    answer: (
      <>
        Nisaab360 replaces chaotic paper admission queues with an automated 5-phase lifecycle:
        <ol className="mt-2 list-decimal list-inside space-y-1 text-slate-700">
          <li><strong>Application Submitted:</strong> Guardian submits biodata and program preferences online.</li>
          <li><strong>Credential Review:</strong> Admissions directorate verifies submitted digital documents and B-Forms.</li>
          <li><strong>Assessment &amp; Interview:</strong> Candidates receive scheduled entrance examination and interview appointments.</li>
          <li><strong>Admissions Offer &amp; Fee Voucher:</strong> Selected applicants receive provisional offers with downloadable fee challans.</li>
          <li><strong>Final Enrollment:</strong> Upon fee payment verification, permanent student roll numbers and accounts are activated.</li>
        </ol>
      </>
    ),
  },
  {
    id: "applicant-portal-documents",
    category: "admissions",
    categoryLabel: "Admissions",
    question: "Can applicants upload verification documents and track their progress in real time?",
    answer: (
      <>
        <strong>Yes.</strong> Every applicant receives secure credentials for the Applicant Dashboard. If documents (B-Form, father&apos;s CNIC, character certificate, previous school results) are flagged or rejected by reviewers, notes explaining the correction are displayed, allowing the applicant to re-upload compressed files directly. Once verified, the next phase (test schedule or fee voucher) appears automatically.
      </>
    ),
  },
  {
    id: "post-enrollment-parent-account",
    category: "admissions",
    categoryLabel: "Admissions",
    question: "What happens after an applicant is accepted and enrolled?",
    answer: (
      <>
        Once the admissions directorate verifies fee settlement, the system automatically:
        <ul className="mt-1.5 list-disc list-inside space-y-1 text-slate-700">
          <li>Issues the official student roll number and permanent student login credentials.</li>
          <li>Converts the applicant email and password into the permanent <strong>Parent Portal</strong> credentials.</li>
          <li>Dispatches automated onboarding emails with portal sign-in instructions.</li>
          <li>Automatically closes temporary applicant portal access after 7 days to preserve data hygiene.</li>
        </ul>
      </>
    ),
  },
  {
    id: "bulk-data-import",
    category: "admissions",
    categoryLabel: "Admissions",
    question: "Can an institution import existing students, teachers, and guardians in bulk?",
    answer: (
      <>
        <strong>Yes.</strong> Nisaab360 includes built-in CSV and Excel bulk import tools. School administrators can import hundreds or thousands of students, roll numbers, guardian phone numbers, and staff profiles with automatic data validation in a matter of minutes.
      </>
    ),
  },
  {
    id: "student-id-cards",
    category: "admissions",
    categoryLabel: "Admissions",
    question: "Can student ID cards be designed and printed directly from Nisaab360?",
    answer: (
      <>
        <strong>Yes.</strong> Nisaab360 includes an automated student ID card generator. The system pulls student photographs, roll numbers, blood groups, guardian contacts, and institutional branding onto printable sheet layouts equipped with barcodes and QR codes for quick scanning.
      </>
    ),
  },

  // Category 3: Fees, Challans & Pakistani Gateways (11 to 15)
  {
    id: "fee-challan-generation",
    category: "fees",
    categoryLabel: "Fees & Payments",
    question: "How does fee voucher and challan generation work in Nisaab360?",
    answer: (
      <>
        Institutions can define flexible fee structures with custom heads (Tuition Fee, Admission Fee, Science Lab, Computer Charges, Transport, Annual Charges). The system auto-generates monthly or term vouchers with designated due dates and late payment penalties, outputting standard <strong>3-copy printable bank challans</strong> (Student Copy, School Copy, Bank Copy).
      </>
    ),
  },
  {
    id: "pakistani-payment-gateways",
    category: "fees",
    categoryLabel: "Fees & Payments",
    question: "Which Pakistani digital payment gateways does Nisaab360 support?",
    answer: (
      <>
        Nisaab360 features native integrations for Pakistan&apos;s leading payment providers:
        <ul className="mt-1.5 list-disc list-inside space-y-1 text-slate-700">
          <li><strong>Easypaisa:</strong> Mobile wallet push prompts, OTC tokens, and debit card checkouts.</li>
          <li><strong>JazzCash:</strong> Mobile account direct debit and voucher checkouts.</li>
          <li><strong>HBL Pay (Habib Bank Limited):</strong> Direct bank debit and Visa/Mastercard processing.</li>
          <li><strong>Over-the-Counter Bank Transfer:</strong> Manual challan deposit slip upload with staff review.</li>
        </ul>
      </>
    ),
  },
  {
    id: "automated-reconciliation",
    category: "fees",
    categoryLabel: "Fees & Payments",
    question: "How does automated fee reconciliation work?",
    answer: (
      <>
        When a parent or student pays online via Easypaisa, JazzCash, or HBL Pay, secure webhook APIs notify Nisaab360 in real-time. The system instantly marks the voucher as <code>PAID</code>, logs the gateway transaction ID, generates a digital receipt, and updates accounting ledgers—eliminating manual teller reconciliation delays.
      </>
    ),
  },
  {
    id: "parent-fee-payment",
    category: "fees",
    categoryLabel: "Fees & Payments",
    question: "Can parents view dues and pay fees directly through their mobile phones?",
    answer: (
      <>
        <strong>Yes.</strong> Parents can log into the Parent Portal or mobile app at any time to inspect current dues, past payment receipts, and breakdown of fee heads. They can either download the printable PDF challan for bank branch deposit or complete online settlement with one click using their mobile wallet.
      </>
    ),
  },
  {
    id: "concessions-scholarships",
    category: "fees",
    categoryLabel: "Fees & Payments",
    question: "Does Nisaab360 support fee concessions, scholarships, and sibling discounts?",
    answer: (
      <>
        <strong>Yes.</strong> The fee engine allows administrators to set up student-specific fee adjustments, merit scholarships, staff child discounts, and automatic sibling concessions. The discounts automatically deduct from calculated monthly challans with clear audit trails.
      </>
    ),
  },

  // Category 4: Academics, Exams & Anti-Cheat (16 to 20)
  {
    id: "daily-diary-homework",
    category: "academics",
    categoryLabel: "Academics & Exams",
    question: "How do teachers share daily class diaries, homework, and study material?",
    answer: (
      <>
        Through the Staff Portal, subject teachers can log daily class work, assigned homework, and file attachments per class section. Once submitted, the entry publishes instantly to student and parent dashboards, eliminating lost paper diaries and miscommunicated assignments.
      </>
    ),
  },
  {
    id: "online-exam-engine",
    category: "academics",
    categoryLabel: "Academics & Exams",
    question: "How does the online examination and testing engine operate?",
    answer: (
      <>
        Nisaab360 contains an online assessment engine supporting multiple-choice questions (MCQs), short answers, and file upload submissions. Instructors can configure strict start/end times, per-question marks, randomized question ordering, and automatic result tabulation upon test completion.
      </>
    ),
  },
  {
    id: "anti-cheat-heartbeat",
    category: "academics",
    categoryLabel: "Academics & Exams",
    question: "Does Nisaab360 have anti-cheat mechanisms during online tests?",
    answer: (
      <>
        <strong>Yes.</strong> Nisaab360 incorporates real-time anti-cheat heartbeat telemetry. The test engine tracks window blur events, tab switching, and fullscreen departures. If a candidate leaves the exam window, the system issues visual warnings, records violation logs for teacher review, and can automatically fail or force-submit the test if unauthorized switching continues.
      </>
    ),
  },
  {
    id: "report-cards-transcripts",
    category: "academics",
    categoryLabel: "Academics & Exams",
    question: "Can Nisaab360 generate term report cards, grading sheets, and transcripts?",
    answer: (
      <>
        <strong>Yes.</strong> The grading module computes weighted exam scores, term assessments, attendance percentages, and teacher remarks. It dynamically generates comprehensive printable report cards, batch broadsheets, and official student transcripts configured to Pakistani percentage and GPA grading scales.
      </>
    ),
  },
  {
    id: "course-streaming-lectures",
    category: "academics",
    categoryLabel: "Academics & Exams",
    question: "Does Nisaab360 support video lecture streaming and live classes?",
    answer: (
      <>
        <strong>Yes.</strong> Faculty can attach video lecture streams, PDF reading resources, and live virtual classroom links directly to specific course chapters. Students can stream lectures on-demand from their portal at their own pace.
      </>
    ),
  },

  // Category 5: Attendance, Mobile Apps & Security (21 to 25)
  {
    id: "attendance-tracking",
    category: "operations",
    categoryLabel: "Attendance & Security",
    question: "How is daily attendance recorded for students and staff in Nisaab360?",
    answer: (
      <>
        Attendance can be collected through:
        <ul className="mt-1.5 list-disc list-inside space-y-1 text-slate-700">
          <li><strong>Teacher Mobile/Web Roll Call:</strong> Quick one-tap morning attendance marking per class section.</li>
          <li><strong>Biometric &amp; RFID Hardware:</strong> Direct synchronization with fingerprint or RFID card turnstiles.</li>
          <li><strong>Staff Clock-In/Clock-Out:</strong> Staff daily attendance logs with leave deduction calculations.</li>
        </ul>
        Unexcused student absences can trigger immediate automated SMS and push notifications to parents.
      </>
    ),
  },
  {
    id: "online-leave-requests",
    category: "operations",
    categoryLabel: "Attendance & Security",
    question: "Can parents and staff submit leave applications online?",
    answer: (
      <>
        <strong>Yes.</strong> Parents can request sick leaves or emergency absences through the Parent Portal, attaching medical certificates if required. Staff members can also submit official leave requests with duty substitute designations. Administrators review, approve, or reject applications with one click.
      </>
    ),
  },
  {
    id: "notifications-pipeline",
    category: "operations",
    categoryLabel: "Attendance & Security",
    question: "How does Nisaab360 keep parents informed regarding announcements and alerts?",
    answer: (
      <>
        Nisaab360 incorporates a multi-channel notification engine: instant mobile app push notifications, automated SMS broadcasts for emergency closures or absent alerts, and email dispatches for report cards and fee vouchers.
      </>
    ),
  },
  {
    id: "data-security-backups",
    category: "operations",
    categoryLabel: "Attendance & Security",
    question: "How secure is school data and does Nisaab360 perform automatic backups?",
    answer: (
      <>
        Institutional security is our core priority. Nisaab360 features strict role-based access control (RBAC), end-to-end SSL/TLS 1.3 encryption, tenant-isolated data partitioning, and <strong>automated daily cloud backups</strong> with one-click export tools so school records are permanently protected against data loss.
      </>
    ),
  },
  {
    id: "how-to-get-started",
    category: "operations",
    categoryLabel: "Attendance & Security",
    question: "How can our school, college, or madrasah get started with Nisaab360?",
    answer: (
      <>
        Getting started is simple. You can register your institution directly at{" "}
        <Link href="/register" className="font-semibold underline text-[#171c1a] hover:opacity-80">
          /register
        </Link>{" "}
        to select a subscription tier based on student strength. For specialized demonstrations, on-premise onboarding, or multi-campus consultations, reach out to our team at{" "}
        <strong>hello@nisaab360.app</strong>.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <LandingHeader />

      <main>
        {/* Editorial Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Frequently Asked Questions / Help Center</span>
            <h1>
              Questions about Nisaab360.
              <span>Answered with clarity.</span>
            </h1>
            <p className={styles.heroLead}>
              Everything you need to know about Pakistan&apos;s modern school management and learning system—from online admissions and Pakistani payment gateways to anti-cheat testing and parent communication.
            </p>
          </div>
        </section>

        {/* Interactive Single-Open Accordion */}
        <FaqAccordion items={FAQ_ITEMS} />

        {/* Final CTA Strip */}
        <section className={styles.finalCta}>
          <div className={styles.finalCtaContent}>
            <span className={styles.eyebrow}>Ready when your institution is</span>
            <h2>Bring your entire school into one unified system.</h2>
            <p>
              Discover how Nisaab360 eliminates paper chaos, accelerates fee collection, and connects teachers, parents, and students seamlessly.
            </p>
            <div className={styles.finalCtaActions}>
              <Link href="/register" className={styles.darkButton}>
                Request institution access
                <ArrowRight size={16} />
              </Link>
              <Link href="/pricing" className={styles.textLink}>
                View pricing plans
                <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Website Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerMain}>
          <div className={styles.footerBrand}>
            <div className="flex items-center gap-2.5">
              <Image src="/Logo.png" alt="Nisaab360 logo" width={36} height={36} />
              <strong style={{ margin: 0 }}>Nisaab360</strong>
            </div>
            <p>One system for the work between the bells.</p>
            <div className="mt-4">
              <a
                href="https://saasbrowser.com/en/saas/1591437/nisaab360"
                target="_blank"
                rel="noopener"
                className="inline-block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://files.saasbrowser.com/xlnuotdo3wchj3kcdggnnx8kl7ts"
                  alt="Nisaab360 - B2B software directory verified badge"
                  width="180"
                  height="120"
                />
              </a>
            </div>
          </div>

          <nav>
            <p>Platform</p>
            <Link href="/#platform">Institution view</Link>
            <Link href="/#features">Features</Link>
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
          <span>© {new Date().getFullYear()} Nisaab360. All rights reserved.</span>
          <p>
            Designed &amp; engineered for Pakistani schools, colleges, and madaris.
          </p>
        </div>
      </footer>
    </div>
  );
}
