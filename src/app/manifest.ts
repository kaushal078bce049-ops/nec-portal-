import type { MetadataRoute } from 'next';

/**
 * Web app manifest.
 *
 * Makes the portal installable to a phone home screen. That matters for this
 * audience specifically: candidates revise on a phone, often on an unreliable
 * connection, and an installed shortcut that opens straight to the daily
 * capsule or quick revision is materially more useful than a browser tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NEC Civil License Portal',
    short_name: 'NEC Civil',
    description:
      'Preparation for the Nepal Engineering Council civil engineering registration examination: syllabus, theory, past papers, model sets and worked solutions.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d111a',
    theme_color: '#0d111a',
    categories: ['education', 'books', 'productivity'],
    lang: 'en',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: "Today's capsule", short_name: 'Capsule', url: '/daily-capsule' },
      { name: 'Quick revision', short_name: 'Revision', url: '/quick-revision' },
      { name: 'Past papers', short_name: 'Papers', url: '/past-papers' },
    ],
  };
}
