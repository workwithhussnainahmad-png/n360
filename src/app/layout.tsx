import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import UpdateNotifier from "@/components/UpdateNotifier";

export const metadata: Metadata = {
  metadataBase: new URL('https://nisaab360.app'),
  title: {
    template: '%s | Nisaab360',
    default: 'Nisaab360 | Best LMS Pakistan & School Management Software',
  },
  description: 'Nisaab360 is a premier Pakistani LMS and school management software for modern educational institutions.',
  keywords: ['Nisaab', 'Nisaab360', 'Pakistani LMS', 'best LMS Pakistan', 'LMS Pakistan', 'school management software Pakistan'],
  openGraph: {
    title: 'Nisaab360 | Modern Educational Platform',
    description: 'The next-generation Pakistani LMS. Simplify admin tasks and improve learning outcomes.',
    url: 'https://nisaab360.app',
    siteName: 'Nisaab360',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nisaab360 | Modern Educational Platform',
    description: 'The next-generation Pakistani LMS. Simplify admin tasks and improve learning outcomes.',
  },
  alternates: {
    canonical: '/',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://nisaab360.app/#organization',
      name: 'Nisaab360',
      url: 'https://nisaab360.app',
      logo: 'https://nisaab360.app/Logo.png',
      sameAs: []
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://nisaab360.app/#software',
      name: 'Nisaab360',
      description: 'The best LMS Pakistan and school management software.',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any',
      url: 'https://nisaab360.app',
    }
  ]
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
      </head>
      <body className="bg-background text-foreground antialiased min-h-screen flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>
          {children}
        </Providers>
        <UpdateNotifier />
      </body>
    </html>
  );
}
