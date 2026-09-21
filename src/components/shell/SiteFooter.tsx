import Link from 'next/link';

import { SocialLinks } from '@/components/shell/SocialLinks';
import { getActiveSocialLinks, getSiteConfig, isConfigured } from '@/lib/content';

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Study',
    links: [
      { href: '/syllabus', label: 'Official Syllabus' },
      { href: '/chapters', label: 'Chapterwise Theory' },
      { href: '/chapters', label: 'Practice Questions' },
      { href: '/quick-revision', label: 'Quick Revision' },
    ],
  },
  {
    heading: 'Practise',
    links: [
      { href: '/past-papers', label: 'Past Papers (15 sets)' },
      { href: '/model-sets', label: 'Model Sets (12 sets)' },
      { href: '/daily-capsule', label: 'Daily Capsule' },
    ],
  },
  {
    heading: 'More',
    links: [
      { href: '/guide', label: 'How to Pass' },
      { href: '/forum', label: 'Discussion Forum' },
      { href: '/about', label: 'About' },
    ],
  },
];

export function SiteFooter({ preparedBy }: { preparedBy: string }) {
  const site = getSiteConfig();
  const socials = getActiveSocialLinks();
  const year = new Date().getFullYear();
  // The blueprint's attribution wins if set; site.json is the fallback so an
  // administrator editing one file does not have to know about the other.
  const author = preparedBy || site.preparedBy.name;
  const email = site.preparedBy.showEmail && isConfigured(site.preparedBy.email)
    ? site.preparedBy.email
    : null;

  return (
    <footer className="border-t border-soft bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                NEC
              </span>
              <span className="text-sm font-semibold text-strong">{site.brand.name}</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-muted">
              Preparation for the Nepal Engineering Council registration examination in civil
              engineering, built strictly around the official 10-chapter syllabus.
            </p>

            {socials.length > 0 && (
              <div className="mt-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Follow {author.split(' ')[0]}
                </h2>
                <SocialLinks links={socials} className="mt-2.5" />
              </div>
            )}
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {col.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={`${col.heading}-${l.label}`}>
                    <Link href={l.href} className="text-sm text-body hover:text-strong">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Attribution band — deliberately given its own row and a rule above it
            so the author's name is not lost among the small print. */}
        <div className="mt-10 border-t border-soft pt-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-body">
                {site.preparedBy.role}{' '}
                <span className="font-semibold text-strong">{author}</span>
              </p>
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="mt-1 inline-block text-xs text-muted hover:text-strong"
                >
                  {email}
                </a>
              )}
            </div>
            {socials.length > 0 && <SocialLinks links={socials} size="sm" />}
          </div>

          <div className="mt-6 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {year} {site.brand.name}. All rights reserved.
            </p>
            <p className="max-w-xl sm:text-right">
              An independent study aid. Not affiliated with or endorsed by the Nepal Engineering
              Council.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
