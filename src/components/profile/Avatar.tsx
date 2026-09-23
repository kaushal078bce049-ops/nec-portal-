/**
 * A profile picture, or initials when there is none.
 *
 * Plain <img> rather than next/image: these are small, already-cropped squares
 * served from Supabase Storage, so the optimiser has nothing to save, and
 * routing them through it would make every avatar a request to our own server
 * for an image the browser could have fetched directly.
 */
const SIZES = {
  sm: { box: 32, text: 'text-xs' },
  md: { box: 44, text: 'text-sm' },
  lg: { box: 96, text: 'text-2xl' },
} as const;

export function Avatar({
  url,
  name,
  size = 'md',
}: {
  url?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
}) {
  const { box, text } = SIZES[size];

  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const common = {
    width: box,
    height: box,
    borderRadius: '50%',
    flexShrink: 0,
  } as const;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ? `${name}'s profile picture` : 'Profile picture'}
        style={{ ...common, objectFit: 'cover', border: '1px solid var(--line-soft)' }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center font-semibold ${text}`}
      style={{
        ...common,
        display: 'inline-flex',
        background: 'var(--accent-soft)',
        color: 'var(--text-strong)',
      }}
    >
      {initials}
    </span>
  );
}
