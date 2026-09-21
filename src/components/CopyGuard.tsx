'use client';

import { useEffect } from 'react';

/**
 * Discourage copying the question bank.
 *
 * Worth being honest about what this is: a deterrent, not a control. Anything a
 * browser renders can be read from the page source, printed, or photographed,
 * and any claim to have prevented that would be false. What it does stop is the
 * casual select-and-paste that puts a whole paper into a chat group in one
 * motion — which is the leak that actually happens.
 *
 * Scoped to the element it wraps. Sign-in fields, the forum composer and
 * anything else a candidate types into keep working normally; breaking copy
 * there would be a bug rather than a protection.
 */
export function CopyGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.getElementById('copy-guard');
    if (!root) return;

    // A selection inside a field the user is filling in is theirs to copy.
    const isEditable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return Boolean(el?.closest?.('input, textarea, [contenteditable="true"]'));
    };

    const block = (e: Event) => {
      if (isEditable(e.target)) return;
      e.preventDefault();
    };

    root.addEventListener('copy', block);
    root.addEventListener('cut', block);
    root.addEventListener('contextmenu', block);
    root.addEventListener('dragstart', block);

    return () => {
      root.removeEventListener('copy', block);
      root.removeEventListener('cut', block);
      root.removeEventListener('contextmenu', block);
      root.removeEventListener('dragstart', block);
    };
  }, []);

  return (
    <div id="copy-guard" className="no-copy">
      {children}
    </div>
  );
}
