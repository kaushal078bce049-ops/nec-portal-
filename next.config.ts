import type { NextConfig } from 'next';

/**
 * Security headers.
 *
 * The CSP is deliberately tight. Next's App Router needs 'unsafe-inline' for the
 * small bootstrap style/script it injects; everything else is locked to self plus
 * the Supabase origin the app actually talks to. `frame-ancestors 'none'` and
 * `X-Frame-Options: DENY` together stop the exam interface being framed, which
 * matters because clickjacking an in-progress attempt could steal submissions.
 */
const supabaseOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  // 'self' only. The eSewa origins that used to be allowed here went with the
  // payment flow; leaving them would widen form-action for a feature that no
  // longer exists.
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  // Profile pictures live in Supabase Storage, so that origin has to be
  // readable as an image source as well as reachable over fetch.
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')}`.trim(),
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Content JSON is read with fs at request time; keep it out of the client graph.
  serverExternalPackages: [],

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Never let an exam page or an API response sit in a shared cache.
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
      {
        source: '/exam/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
