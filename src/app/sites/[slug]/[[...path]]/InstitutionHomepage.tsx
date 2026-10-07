import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ExternalLink, Mail, MapPin, Phone } from 'lucide-react';
import type { PublicInstitutionTenant } from '@/lib/institution-tenant';
import { institutionPublicUrl } from '@/lib/institution-domain';
import { getPublicSiteTheme } from '@/lib/public-site-themes';
import { PublicWebsiteNotices } from './PublicWebsiteNotices';
import { ThemeArtwork } from './ThemeArtwork';
import styles from './InstitutionHomepage.module.css';

type PublicEventCard = { id: number; title: string; slug: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null };
type Props = { tenant: PublicInstitutionTenant; baseDomain: string; studentLoginUrl: string; publicEvents: PublicEventCard[] };

export function InstitutionHomepage({ tenant, baseDomain, studentLoginUrl, publicEvents }: Props) {
  const theme = getPublicSiteTheme(tenant.theme);
  const mosaic = theme.id === 'mosaic';
  const institutionType = tenant.type.charAt(0) + tenant.type.slice(1).toLowerCase();
  const introduction = tenant.description || `${tenant.name} is a ${institutionType.toLowerCase()} in ${tenant.city}, ${tenant.country}.`;
  const initials = tenant.name.split(/\s+/).filter((word) => !['of', 'the', 'and'].includes(word.toLowerCase())).slice(0, 3).map((word) => word[0]).join('').toUpperCase();
  const hasLogo = tenant.logoKey.startsWith('http') || tenant.logoKey.startsWith('/');
  const hasContact = Boolean(tenant.publicEmail || tenant.publicPhone || tenant.publicAddress);
  const hasTimetable = tenant.websiteNotices.publishedTimetable.enabled && Boolean(tenant.websiteNotices.publishedTimetable.imageUrl);
  const publicUrl = institutionPublicUrl(tenant.publicSlug, undefined, 'https:', baseDomain);
  const socialLinks = [ { label: 'Facebook', href: tenant.facebookUrl }, { label: 'Instagram', href: tenant.instagramUrl }, { label: 'YouTube', href: tenant.youtubeUrl } ].filter((link): link is { label: string; href: string } => Boolean(link.href));
  const navigation = [
    { label: 'About', href: '#about' },
    ...(tenant.programs.length ? [{ label: 'Programs', href: '#programs' }] : []),
    ...(publicEvents.length ? [{ label: 'Events', href: '#events' }] : []),
    ...(hasTimetable ? [{ label: 'Timetable', href: '#timetable' }] : []),
    ...(tenant.galleryImages.length ? [{ label: 'Campus', href: '#campus' }] : []),
    ...(hasContact ? [{ label: 'Contact', href: '#contact' }] : []),
  ];
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org', '@type': tenant.type === 'UNIVERSITY' ? 'CollegeOrUniversity' : 'EducationalOrganization',
    name: tenant.name, url: publicUrl, logo: hasLogo ? tenant.logoKey : undefined, image: tenant.heroImageUrl || undefined,
    email: tenant.publicEmail || undefined, telephone: tenant.publicPhone || undefined,
    address: { '@type': 'PostalAddress', streetAddress: tenant.publicAddress || undefined, addressLocality: tenant.city, addressCountry: tenant.country },
  }).replace(/</g, '\\u003c');
  const brand = <><span className={styles.brandMark}>{hasLogo ? <Image src={tenant.logoKey} alt="" width={48} height={48} /> : initials}</span><span><strong>{tenant.name}</strong><small>{institutionType} · {tenant.city}</small></span></>;
  const heroCopy = <div className={styles.heroCopy}>
    <p className={styles.eyebrow}>{institutionType} / {tenant.city}, {tenant.country}</p>
    <h1>{tenant.tagline || tenant.name}</h1>
    {tenant.tagline && <p className={styles.heroName}>{tenant.name}</p>}
    <div className={styles.actions}><a href="#about" className={mosaic ? styles.primary : styles.readLink}>Discover our {institutionType.toLowerCase()} {mosaic && <ArrowRight size={16} />}</a>{hasContact && <a href="#contact" className={mosaic ? styles.secondary : styles.readLink}>Get in touch</a>}</div>
  </div>;
  const heroVisual = <div className={styles.heroVisual}>
    {tenant.heroImageUrl ? <Image unoptimized src={tenant.heroImageUrl} alt={`${tenant.name} campus`} fill sizes="(max-width: 900px) 100vw, 60vw" priority className={styles.cover} /> : mosaic ? <ThemeArtwork theme={theme.id} /> : <div className={styles.identityCover}><strong>{initials}</strong><span>{tenant.name}</span><small>{tenant.city}, {tenant.country}</small></div>}
    {mosaic && <span className={styles.visualCaption}>{tenant.heroImageUrl ? tenant.name : 'Knowledge opens possibilities'}</span>}
  </div>;

  return <div className={`${styles.site} ${styles[theme.id]}${mosaic ? '' : ` ${styles.edition}`}`} data-theme={theme.id} style={{ '--site-accent': theme.accent, '--paper': theme.paper, '--ink': theme.ink } as CSSProperties}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
    <PublicWebsiteNotices notices={tenant.websiteNotices} />
    {tenant.announcementText && <div className={styles.announcement}>{tenant.announcementLink ? <Link href={tenant.announcementLink}>{tenant.announcementText} {mosaic && <ArrowRight size={14} />}</Link> : tenant.announcementText}</div>}
    {mosaic ? <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label={`${tenant.name} home`}>{brand}</Link>
        <nav className={styles.desktopNav} aria-label="Institution navigation">{navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
        <div className={styles.headerActions}>
          <a href={studentLoginUrl} className={styles.login}>Student login</a>
          {tenant.admissionsEnabled && <Link href="/admissions" className={styles.primary}>Admissions <ArrowRight size={14} /></Link>}
          <details className={styles.mobileMenu}><summary>Menu <span aria-hidden="true">☰</span></summary><nav aria-label="Mobile institution navigation">{navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}<a href={studentLoginUrl}>Student login</a>{tenant.admissionsEnabled && <Link href="/admissions">Admissions</Link>}</nav></details>
        </div>
      </div>
    </header> : <header className={`${styles.header} ${styles.editionHeader}`}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label={`${tenant.name} home`}>{brand}</Link>
        <nav className={styles.openNav} aria-label="Institution navigation">{navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}{tenant.admissionsEnabled && <Link href="/admissions">Admissions</Link>}</nav>
      </div>
    </header>}

    <main>
      <section className={styles.hero} aria-label="Welcome">
        {theme.id === 'default' ? <div className={styles.defaultHero}>{heroCopy}{heroVisual}</div>
          : theme.id === 'heritage' ? <div className={styles.businessHero}>{heroCopy}{heroVisual}</div>
          : theme.id === 'folio' ? <div className={styles.schoolHero}>{heroVisual}{heroCopy}</div>
          : theme.id === 'grove' ? <div className={styles.collegeHero}>{heroCopy}{heroVisual}</div>
          : theme.id === 'orbit' ? <div className={styles.focusHero}>{heroCopy}{heroVisual}</div>
          : <div className={styles.heroGrid}>{heroCopy}{heroVisual}</div>}
      </section>
      {tenant.statistics.length > 0 && <section className={styles.statistics} aria-label="Institution at a glance">{tenant.statistics.map((stat, index) => <div key={`${stat.label}-${index}`}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</section>}

      <section id="about" className={`${styles.section} ${styles.about}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>01 / Our story</p><h2>{tenant.aboutTitle || `Welcome to ${tenant.name}`}</h2></div>
        <div className={styles.aboutBody}><p className={styles.introduction}>{introduction}</p>{(tenant.mission || tenant.vision) && <div className={styles.values}>{tenant.mission && <article><h3>Our mission</h3><p>{tenant.mission}</p></article>}{tenant.vision && <article><h3>Our vision</h3><p>{tenant.vision}</p></article>}</div>}</div>
      </section>

      {tenant.programs.length > 0 && <section id="programs" className={`${styles.section} ${styles.programs}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>Learning pathways</p><h2>A place for your next chapter.</h2></div>
        <div className={styles.programList}>{tenant.programs.map((program, index) => <article key={`${program.title}-${index}`}><span className={styles.itemNumber}>{String(index + 1).padStart(2, '0')}</span><h3>{program.title}</h3><p>{program.description || 'Contact the institution for program details.'}</p></article>)}</div>
      </section>}

      {publicEvents.length > 0 && <section id="events" className={`${styles.section} ${styles.events}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>On the calendar</p><h2>Life beyond the classroom.</h2></div>
        <div className={styles.eventGrid}>{publicEvents.map((event) => <article key={event.id}><Link href={`/event/${event.slug}`} className={styles.eventImage} aria-label={event.title}>{event.coverImageUrl ? <Image unoptimized fill sizes="(max-width: 700px) 100vw, 450px" src={event.coverImageUrl} alt="" className={styles.cover} /> : <CalendarDays size={48} aria-hidden="true" />}</Link><div className={styles.eventMeta}>{event.eventDate && <span>{event.eventDate}</span>}{event.venue && <span>{event.venue}</span>}</div><h3><Link href={`/event/${event.slug}`}>{event.title}</Link></h3>{event.summary && <p>{event.summary}</p>}<Link className={styles.textLink} href={`/event/${event.slug}`}>Event details <ArrowRight size={15} /></Link></article>)}</div>
      </section>}

      {hasTimetable && <section id="timetable" className={`${styles.section} ${styles.timetable}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>Academic schedule</p><h2>Class timetable.</h2><a className={styles.textLink} href={tenant.websiteNotices.publishedTimetable.imageUrl} target="_blank" rel="noopener noreferrer">Open full size <ExternalLink size={15} /></a></div>
        <a href={tenant.websiteNotices.publishedTimetable.imageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open class timetable at full size" className={styles.timetableImage}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tenant.websiteNotices.publishedTimetable.imageUrl} alt={`${tenant.name} class timetable`} loading="lazy" />
        </a>
      </section>}

      {tenant.principalMessage && <section className={`${styles.section} ${styles.leadership}`}>
        {tenant.principalImageUrl ? <div className={styles.portrait}><Image unoptimized fill sizes="(max-width: 700px) 100vw, 450px" src={tenant.principalImageUrl} alt={tenant.principalName || 'Institution leader'} className={styles.cover} /></div> : <span className={styles.quoteMark} aria-hidden="true">“</span>}
        <div><p className={styles.eyebrow}>From the leadership</p><blockquote>{tenant.principalMessage}</blockquote><strong>{tenant.principalName || 'Institution leadership'}</strong>{tenant.principalTitle && <p>{tenant.principalTitle}</p>}</div>
      </section>}

      {tenant.highlights.length > 0 && <section className={`${styles.section} ${styles.highlights}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>Our community</p><h2>More to discover.</h2></div>
        <div className={styles.highlightGrid}>{tenant.highlights.map((highlight, index) => <article key={`${highlight.title}-${index}`}><span className={styles.itemNumber}>{String(index + 1).padStart(2, '0')}</span><h3>{highlight.title}</h3><p>{highlight.description || 'Contact us to learn more.'}</p></article>)}</div>
      </section>}

      {tenant.galleryImages.length > 0 && <section id="campus" className={`${styles.section} ${styles.gallery}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>A closer look</p><h2>Inside {tenant.name}.</h2></div>
        <div className={styles.galleryGrid}>{tenant.galleryImages.map((image, index) => <figure key={`${image.url}-${index}`}><div><Image unoptimized fill sizes="(max-width: 700px) 100vw, 450px" src={image.url} alt={image.caption || `${tenant.name} campus`} className={styles.cover} /></div>{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div>
      </section>}

      {tenant.admissionsEnabled && <section className={`${styles.section} ${styles.admissions}`}>
        <div><p className={styles.eyebrow}>Your next step</p><h2>Begin your journey with us.</h2><p>Explore current admission rounds or return to your application.</p></div><div className={styles.actions}><Link href="/admissions" className={styles.primary}>View admissions <ArrowRight size={16} /></Link><Link href="/admissions/login" className={styles.secondary}>Applicant login</Link></div>
      </section>}

      {hasContact && <section id="contact" className={`${styles.section} ${styles.contact}`}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>Let’s connect</p><h2>A conversation starts here.</h2></div>
        <div className={styles.contactDetails}>
          {tenant.publicAddress && <div><MapPin size={19} /><div><h3>Visit us</h3><p>{tenant.publicAddress}</p>{tenant.mapUrl && <a className={styles.textLink} href={tenant.mapUrl} target="_blank" rel="noopener noreferrer">View map <ExternalLink size={14} /></a>}</div></div>}
          {tenant.publicPhone && <a href={`tel:${tenant.publicPhone}`}><Phone size={19} /><span><strong>Call our office</strong><span>{tenant.publicPhone}</span></span></a>}
          {tenant.publicEmail && <a href={`mailto:${tenant.publicEmail}`}><Mail size={19} /><span><strong>Email us</strong><span>{tenant.publicEmail}</span></span></a>}
        </div>
      </section>}
    </main>

    {mosaic ? <footer className={styles.footer}>
      <div className={styles.footerTop}><Link href="/" className={styles.brand} aria-label={`${tenant.name} home`}>{brand}</Link><p>{tenant.city}, {tenant.country}</p>{socialLinks.length > 0 && <nav aria-label="Social media">{socialLinks.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label} <ExternalLink size={13} /></a>)}</nav>}</div>
      <div className={styles.footerBottom}><span>© {new Date().getFullYear()} {tenant.name}</span><div><a href={studentLoginUrl}>Student login</a><Link href="/admissions/login">Applicant login</Link></div><span>Powered by Nisaab360</span></div>
    </footer> : <footer className={styles.editionFooter}>
      <div><strong>{tenant.name}</strong><p>{tenant.city}, {tenant.country}</p></div>
      <nav aria-label="Institution portals"><a href={studentLoginUrl}>Student portal</a><Link href="/admissions/login">Applicant portal</Link>{socialLinks.map(({ label, href }) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}</nav>
    </footer>}
  </div>;
}
