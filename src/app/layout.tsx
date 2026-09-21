import type { Metadata, Viewport } from 'next';

import { CopyGuard } from '@/components/CopyGuard';
import { SiteFooter } from '@/components/shell/SiteFooter';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { getAttribution, getSyllabus } from '@/lib/content';
import { getSessionUser } from '@/lib/supabase/server';

import './globals.css';

// NEXT_PUBLIC_SITE_URL is the canonical origin. It is required for absolute
// OpenGraph/canonical URLs; without it Next emits relative ones and social
// previews break. The localhost fallback only applies in development.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NEC Civil License Portal — Registration Examination Preparation',
    template: '%s · NEC Civil License Portal',
  },
  description:
    'Complete preparation portal for the Nepal Engineering Council civil engineering registration examination: official syllabus, chapterwise theory, 15 past paper sets, 10 model sets, daily capsule and quick revision — with worked solutions for every question.',
  applicationName: 'NEC Civil License Portal',
  keywords: [
    'NEC', 'Nepal Engineering Council', 'civil engineering', 'license examination',
    'license exam', 'registration examination', 'past papers', 'model questions',
    'engineering license Nepal',
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'NEC Civil License Portal',
    url: SITE_URL,
    title: 'NEC Civil License Portal',
    description:
      'Syllabus, chapterwise theory and questions, 15 past papers, 10 model sets, discussion forum, daily capsule and quick revision for the NEC civil engineering license examination.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEC Civil License Portal',
    description:
      'Free preparation for the Nepal Engineering Council civil engineering registration examination — syllabus, theory, past papers, model sets and worked solutions.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0d111a' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once here so the header does not trigger a second session lookup.
  const [user, syllabus, attribution] = await Promise.all([
    getSessionUser().catch(() => null),
    Promise.resolve(getSyllabus()),
    Promise.resolve(getAttribution()),
  ]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-strong"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader user={user} chapters={syllabus.chapters.map((c) => ({ code: c.code, no: c.no, title: c.title }))} />
          <main id="main" className="flex-1">
            <CopyGuard>{children}</CopyGuard>
          </main>
          <SiteFooter preparedBy={attribution.preparedBy} />
        </div>
      </body>
    </html>
  );
}
