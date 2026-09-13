import type { MetadataRoute } from 'next';

import { getSyllabus } from '@/lib/content';

/**
 * sitemap.xml
 *
 * Lists every publicly readable page: the static portals, each chapter, each
 * subchapter's theory page and each chapter's practice bank. Pages behind a
 * login and the exam runner are deliberately absent — they are disallowed in
 * robots.ts for the same reason.
 *
 * Paper pages are not listed individually because a paper is opened through
 * the exam runner rather than at a stable readable URL; the two index pages
 * (/past-papers and /model-sets) are the crawlable entry points.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
    || 'http://localhost:3000';
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${site}/syllabus`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${site}/chapters`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${site}/past-papers`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${site}/model-sets`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${site}/quick-revision`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${site}/daily-capsule`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${site}/guide`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${site}/forum`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${site}/about`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];

  for (const chapter of getSyllabus().chapters) {
    entries.push({
      url: `${site}/chapters/${chapter.code}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    });
    entries.push({
      url: `${site}/chapters/${chapter.code}/practice`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    });
    for (const sub of chapter.subchapters ?? []) {
      entries.push({
        url: `${site}/chapters/${chapter.code}/${sub.code}`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.7,
      });
    }
  }

  return entries;
}
