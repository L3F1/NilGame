// Run every root regression suite in isolation: existing suites call
// process.exit and geometry/physics modules contain mutable world state.
// The independent server prototype keeps its own npm test command.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const suites = readdirSync(root).filter((name) => name.endsWith('.test.js')).sort();
let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    cwd: root, encoding: 'utf8', timeout: 120000, windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    failed++;
    console.error(`FAIL ${suite}\n${result.stdout || ''}${result.stderr || ''}`);
    if (result.error) console.error(result.error.message);
  } else {
    const summary = result.stdout.trim().split(/\r?\n/).at(-1);
    console.log(`PASS ${suite}: ${summary}`);
  }
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exitCode = failed || suites.length === 0 ? 1 : 0;
