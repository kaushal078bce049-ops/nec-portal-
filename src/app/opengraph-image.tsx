import { ImageResponse } from 'next/og';

import { getSiteConfig } from '@/lib/content';

/**
 * The social preview card. Generated at build/request time rather than shipped
 * as a binary so the brand name and tagline follow content/site.json instead of
 * being baked into an image nobody can edit.
 */
export const alt = 'NEC Civil License Portal — preparation for the Nepal Engineering Council civil registration examination';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  let brand = 'NEC Civil License Portal';
  let tagline = 'Nepal Engineering Council — Civil Engineering Registration Examination';
  try {
    const site = getSiteConfig();
    brand = site?.brand?.name ?? brand;
    tagline = site?.brand?.tagline ?? tagline;
  } catch {
    // Fall back to the defaults above if the content layer is unavailable.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0d111a 0%, #131a27 55%, #0d111a 100%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 18,
              height: 64,
              background: '#4da3ff',
              borderRadius: 4,
              display: 'flex',
            }}
          />
          <div style={{ color: '#8ea0bb', fontSize: 30, letterSpacing: 1 }}>
            Free · Complete · Worked solutions
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#f2f5fa', fontSize: 82, fontWeight: 700, lineHeight: 1.05 }}>
            {brand}
          </div>
          <div style={{ color: '#a9b8cd', fontSize: 34, marginTop: 22, lineHeight: 1.3 }}>
            {tagline}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 46, color: '#8ea0bb', fontSize: 27 }}>
          <div style={{ display: 'flex' }}>10 chapters · 60 subchapters</div>
          <div style={{ display: 'flex' }}>20 past papers · 12 model sets</div>
          <div style={{ display: 'flex' }}>3,500+ solved questions</div>
        </div>
      </div>
    ),
    size,
  );
}
