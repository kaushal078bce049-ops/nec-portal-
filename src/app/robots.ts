import type { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * The whole site is behind a login wall, so there is nothing for a crawler to
 * index: every content URL answers a signed-out request with a redirect to
 * /login. Inviting crawlers anyway would have them index that redirect under
 * the address of each real page, which is worse than not being indexed — a
 * search result promising the ACiE05 theory and delivering a sign-in form.
 *
 * If the wall is ever lifted, this is the file to change back, alongside
 * PUBLIC_PATHS in src/proxy.ts. The sitemap is still emitted and still
 * correct; it simply has no audience while this stands.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    || 'http://localhost:3000';

  return {
    rules: [
      {
        userAgent: '*',
        disallow: '/',
      },
    ],
    host: site,
  };
}
