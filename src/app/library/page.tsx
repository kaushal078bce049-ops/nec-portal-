import type { Metadata } from 'next';
import Link from 'next/link';

import { getLibrary } from '@/lib/content';
import type { LibraryFile } from '@/lib/content/types';

export const metadata: Metadata = {
  title: 'Downloads',
  description:
    'Download the complete NEC civil engineering license preparation material as PDF books and Word documents — syllabus, chapterwise theory, 15 past papers, 10 model sets and quick revision, all free.',
};

const SIZE = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/**
 * The offline editions.
 *
 * Candidates revise on phones, often on a connection that is not reliable and
 * not free. A downloaded book is worth more to them than a page that has to be
 * fetched each time, and the same files are what an institute prints.
 */
export default function LibraryPage() {
  const library = getLibrary();

  if (!library) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <header className="max-w-3xl">
          <span className="chip chip-free">Downloads · Free</span>
          <h1 className="mt-4 text-3xl sm:text-4xl">Downloads</h1>
          <p className="mt-4 text-lg text-body">
            The printable editions have not been published yet. Everything in them is already
            readable on the site — start with the{' '}
            <Link href="/syllabus" className="underline">syllabus</Link> or{' '}
            <Link href="/chapters" className="underline">chapterwise theory</Link>.
          </p>
        </header>
      </div>
    );
  }

  // Preserve the manifest's order: it is deliberate, whole books before pieces.
  const groups: { name: string; files: LibraryFile[] }[] = [];
  for (const file of library.files) {
    const last = groups[groups.length - 1];
    if (last && last.name === file.group) last.files.push(file);
    else groups.push({ name: file.group, files: [file] });
  }

  const totalBytes = library.files.reduce((n, f) => n + f.bytes, 0);
  const pdfs = library.files.filter((f) => f.kind === 'pdf').length;
  const docs = library.files.length - pdfs;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <header className="max-w-3xl">
        <span className="chip chip-free">Downloads · Free</span>
        <h1 className="mt-4 text-3xl sm:text-4xl">Downloads</h1>
        <p className="mt-4 text-lg text-body">
          The whole portal as printable books. Every question carries its full worked solution and
          its exam tip, exactly as on the site — this is the same material, for reading offline,
          printing, or carrying into the last week before the examination.
        </p>
        <p className="mt-3 text-sm text-muted">
          {pdfs} PDF {pdfs === 1 ? 'file' : 'files'} and {docs} Word{' '}
          {docs === 1 ? 'document' : 'documents'}, {SIZE(totalBytes)} in total. Updated{' '}
          {library.generatedAt}. Free, with no account needed.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {groups.map((group) => (
          <section key={group.name}>
            <h2 className="text-lg text-strong">{group.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {group.files.length} {group.files.length === 1 ? 'file' : 'files'} ·{' '}
              {SIZE(group.files.reduce((n, f) => n + f.bytes, 0))}
            </p>

            <ul className="mt-4 divide-y divide-soft rounded-xl border border-soft">
              {group.files.map((file) => (
                <li
                  key={file.path}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <span className="chip">{file.kind.toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-body">{file.title}</span>
                  <span className="text-sm tabular-nums text-muted">{SIZE(file.bytes)}</span>
                  {/*
                    A plain link, not a fetch. The file is on another origin, so
                    anything clever here would need the CSP widened for no gain;
                    the browser downloads it perfectly well on its own.
                  */}
                  <a
                    className="btn btn-outline"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 rounded-xl border border-soft bg-sunken p-5 text-sm text-muted">
        <p>
          <strong className="text-strong">Which one should I take?</strong> If you want a single
          book, take the PDF complete volumes. If you are revising one chapter, take that chapter&apos;s
          file from the split sets. The Word documents carry the same content and are there for
          anyone who needs to edit, re-format or import it.
        </p>
      </footer>
    </div>
  );
}
