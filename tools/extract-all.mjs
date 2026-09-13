#!/usr/bin/env node
/**
 * Batch-extract every scanned source PDF into ../source-pages/<group>/.
 * Skips groups that already have the expected number of files so the job is
 * resumable. Run with a generous heap for the two large books:
 *   node --max-old-space-size=6144 tools/extract-all.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'C:/Users/ACER/Downloads/Civil license';
const NEC = `${SRC}/NEC License-20260816T120506Z-1-001/NEC License`;
const OUT = `${SRC}/source-pages`;
const EXTRACT = path.join(import.meta.dirname, 'pdf-extract.mjs');

const jobs = [
  { group: 'quick-revision', pdf: `${SRC}/Quick-Revision-NEC_260725_161708.pdf`, expect: 34 },
  { group: 'other-sets', pdf: `${NEC}/Other Sets.pdf`, expect: 168 },
  { group: 'book-complete', pdf: `${SRC}/License Book - Complete (1-37).pdf`, expect: 1024 },
  { group: 'book-fasttrack', pdf: `${SRC}/License Civil Fast track Book   .pdf`, expect: 513 },
];

for (let n = 4; n <= 18; n++) {
  jobs.push({
    group: `past-sets/set${String(n).padStart(2, '0')}`,
    pdf: `${NEC}/NEC/past question set ${n}.pdf`,
    expect: 20,
  });
}

let done = 0;
let skipped = 0;
for (const job of jobs) {
  const outDir = path.join(OUT, job.group);
  const have = fs.existsSync(outDir)
    ? fs.readdirSync(outDir).filter((f) => /\.(jpg|png)$/i.test(f)).length
    : 0;

  if (have >= job.expect) {
    console.log(`SKIP  ${job.group} (${have} pages already present)`);
    skipped++;
    continue;
  }
  if (!fs.existsSync(job.pdf)) {
    console.log(`MISS  ${job.group} -> ${job.pdf}`);
    continue;
  }

  const t0 = Date.now();
  process.stdout.write(`EXTRACT ${job.group} ... `);
  try {
    execFileSync(process.execPath, ['--max-old-space-size=6144', EXTRACT, job.pdf, outDir, '--quiet'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const got = fs.readdirSync(outDir).filter((f) => /\.(jpg|png)$/i.test(f)).length;
    console.log(`${got} pages in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    done++;
  } catch (err) {
    console.log(`FAILED: ${err.message.split('\n')[0]}`);
  }
}

console.log(`\n==== extracted ${done} group(s), skipped ${skipped} ====`);
