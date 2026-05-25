// check-test-runner.mjs — guardrail (§test-runner-unification).
// Fails if any *.test.ts(x) imports from 'vitest': those files are INERT under
// the project runner `node --test` (their suites register into vitest's
// collector, which never runs → 0 assertions, false green).
// Fix: convert to node:test, OR rename to *.vitest.ts(x) for vitest.config.unit.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.test\.tsx?$/.test(entry) && /from\s+['"]vitest['"]/.test(readFileSync(p, 'utf8'))) {
      offenders.push(p);
    }
  }
};
walk('src');

if (offenders.length > 0) {
  console.error(`\n✖ ${offenders.length} *.test.ts(x) file(s) import from 'vitest' — INERT under \`node --test\`:`);
  for (const o of offenders) console.error('   - ' + o);
  console.error("\n  Fix: port to node:test (import { test } from 'node:test'),");
  console.error('  or rename to *.vitest.ts(x) so vitest.config.unit.ts runs it (jsdom).\n');
  process.exit(1);
}
console.log('✓ test-runner check: no vitest imports in *.test.ts(x)');
