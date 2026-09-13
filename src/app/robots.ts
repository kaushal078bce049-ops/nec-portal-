import type { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * The study content is meant to be found by search engines. The areas behind a
 * login, the exam runner and the API are not — indexing them wastes crawl
 * budget and can surface half-states (an in-progress attempt, a result page)
 * that mean nothing to a visitor arriving cold.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    || 'http://localhost:3000';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/dashboard',
          '/exam/',
          '/auth/',
          '/login',
          '/signup',
          '/forum/new',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
