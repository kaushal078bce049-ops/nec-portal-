'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import type { SessionUser } from '@/lib/supabase/server';

interface ChapterLink {
  code: string;
  no: number;
  title: string;
}

const PORTALS = [
  { href: '/syllabus', label: 'Syllabus' },
  { href: '/chapters', label: 'Theory & Practice' },
  { href: '/past-papers', label: 'Past Papers' },
  { href: '/model-sets', label: 'Model Sets' },
  { href: '/daily-capsule', label: 'Daily Capsule' },
  { href: '/quick-revision', label: 'Quick Revision' },
  { href: '/guide', label: 'How to Pass' },
  { href: '/forum', label: 'Forum' },
];

export function SiteHeader({
  user,
  chapters,
}: {
  user: Pick<SessionUser, 'fullName' | 'role'> | null;
  chapters: ChapterLink[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The drawer is closed from the link handlers below rather than from an effect
  // on `pathname`: an effect would fire a second render on every navigation.
  const closeDrawer = () => setOpen(false);

  // The exam interface deliberately renders without site chrome.
  if (pathname?.startsWith('/exam/')) return null;

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-soft bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            NEC
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-semibold text-strong">Civil License Portal</span>
            <span className="block text-xs text-muted">Registration Examination</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {PORTALS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              aria-current={isActive(p.href) ? 'page' : undefined}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={
                isActive(p.href)
                  ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                  : { color: 'var(--text-body)' }
              }
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link href="/admin" className="btn btn-ghost hidden sm:inline-flex">
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className="btn btn-primary">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation"
            className="btn btn-ghost px-2.5 lg:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d={open ? 'M5 5l10 10M15 5L5 15' : 'M3 6h14M3 10h14M3 14h14'}
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-soft bg-card lg:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <ul className="grid gap-1 sm:grid-cols-2">
              {PORTALS.map((p) => (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    onClick={closeDrawer}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium"
                    style={
                      isActive(p.href)
                        ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
                        : { color: 'var(--text-body)' }
                    }
                  >
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Chapters
            </p>
            <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
              {chapters.map((c) => (
                <li key={c.code}>
                  <Link
                    href={`/chapters/${c.code}`}
                    onClick={closeDrawer}
                    className="block rounded-lg px-3 py-2 text-sm text-body"
                  >
                    <span className="text-muted">{c.no}.</span> {c.title}
                  </Link>
                </li>
              ))}
            </ul>

            {!user && (
              <Link href="/login" onClick={closeDrawer} className="btn btn-outline mt-4 w-full">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
