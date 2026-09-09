// tools/ball-conformance.js — JS half of the ball-validator conformance evidence.
//
// Runs every case in levels/fixtures/ball-document-cases.json through the JS
// validators (general schema + ball host) and writes
// levels/fixtures/ball-conformance-expectations.json: the language-neutral
// verdict table the native adapter (experiments/godot/ball_document.gd) can
// later be checked against. It REPORTS; it never mutates the fixture.
// Exits nonzero on any JS mismatch, shape violation, or native-message drift.
//
// The native verdicts in the case file are DECLARED from reading _valid, not
// executed: Godot never runs here. The one thing this tool takes from the
// .gd source is its single generic rejection literal, extracted textually so
// a rewording fails loudly instead of silently dating the expectations.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateScene } from '../engine/world/document.js';
import { compileBallScene } from '../engine/world/ball-scene.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const casePath = root + 'levels/fixtures/ball-document-cases.json';
const gdPath = root + 'experiments/godot/ball_document.gd';
const outPath = root + 'levels/fixtures/ball-conformance-expectations.json';

const { cases } = JSON.parse(readFileSync(casePath, 'utf8'));
const gdSource = readFileSync(gdPath, 'utf8');
const gdLines = gdSource.split('\n');

// The native adapter reports ONE generic literal for every document rejection
// (ball_document.gd replace()). Extract it textually: exactly one LONE
// `error = "..."` literal line is expected — the file I/O errors assign
// `"..." + path` concatenations and never match this anchored pattern.
// Anything other than one match means the native error shape changed and the
// mapping below needs a human update.
const nativeLiterals = [...gdSource.matchAll(/^\s*error = "([^"]+)"\s*$/gm)].map((m) => m[1]);
assert.equal(nativeLiterals.length, 1,
  `expected exactly one native generic rejection literal, found ${nativeLiterals.length}`);
const nativeGenericRejection = nativeLiterals[0];

const failures = [];
const seen = new Set();
for (const c of cases) {
  const tag = `case ${c.id || '(missing id)'}`;
  try {
    assert.ok(c.id && !seen.has(c.id), 'duplicate or missing id');
    seen.add(c.id);
    assert.ok(c.reason && c.reason.length > 0, 'missing plain-language reason');
    assert.match(c.reasonKind || '', /^[a-z0-9-]+$/,
      'reasonKind must be a short stable slug both runtimes can match');
    for (const field of ['general', 'ballHost', 'native']) {
      assert.ok(c[field] === 'accept' || c[field] === 'reject',
        `${field} must be accept or reject`);
    }
    assert.match(c.nativeRule || '', /^L\d+/,
      'nativeRule must cite the answering _valid clause (e.g. L63 bounds)');
    const cited = Number(c.nativeRule.match(/^L(\d+)/)[1]);
    assert.ok(cited >= 1 && cited <= gdLines.length,
      `nativeRule cites L${cited} outside ball_document.gd (${gdLines.length} lines)`);
    if (c.ballHost === 'accept') assert.ok(!c.errorContains, 'accepts carry no errorContains');
    else assert.ok(c.errorContains, 'rejects need the literal JS errorContains');

    // Execute the JS side exactly as ball-scene.test.js does.
    const doc = JSON.parse(JSON.stringify(c.document));
    const before = JSON.stringify(doc);
    let generalError = null, hostError = null, host = null;
    try { validateScene(doc); } catch (error) { generalError = error.message; }
    if (!generalError) {
      try { host = compileBallScene(doc); } catch (error) { hostError = error.message; }
    }
    assert.equal(JSON.stringify(doc), before, 'validation mutated the source document');
    assert.equal(generalError ? 'reject' : 'accept', c.general,
      `general verdict drift: ${generalError || 'accepted'}`);
    if (c.ballHost === 'accept') {
      assert.ok(host, `ball host rejected: ${hostError}`);
    } else {
      const reason = generalError || hostError;
      assert.ok(reason, 'ball host accepted, expected rejection');
      assert.ok(reason.includes(c.errorContains), `wrong JS rejection: ${reason}`);
    }
    // The tangent case is only meaningful if the boundary is EXACT in float:
    // hypot + radius === extent, not merely close.
    if (c.id === 'tangent-ball') {
      const ball = c.document.entities.find((e) => e.kind === 'ball');
      const extent = c.document.regions[0].extent;
      const sum = Math.hypot(...ball.position) + ball.radius;
      assert.equal(sum, extent, `tangent case is not exactly on the boundary: ${sum} vs ${extent}`);
    }
  } catch (error) {
    failures.push(`${tag}: ${error.message}`);
  }
}

const expectations = {
  _note: 'JS-executed conformance expectations for the shared ball-document cases. '
    + 'general/ballHost were RUN here; native verdicts are DECLARED from reading '
    + 'ball_document.gd and need a Godot run (see openQuestions).',
  generatedBy: 'tools/ball-conformance.js',
  sourceFixture: 'levels/fixtures/ball-document-cases.json',
  nativeAdapter: 'experiments/godot/ball_document.gd',
  nativeEvidence: 'code reading only; Godot never executed by this tool',
  nativeGenericRejection,
  openQuestions: [
    'Does replace() accept valid-lab and tangent-ball and reject the other 20 cases?',
    'Tangent float path: does the native sqrt arrive at exactly extent (accept) on real Godot floats?',
    'Do full-precision decimals survive Godot JSON.parse_string / save_file round trips?',
    'Does the duplicate-kind rule (extra-ball, extra-spawn) fire as read, once executed?',
    'Is the generic rejection literal still exactly nativeGenericRejection above?',
  ],
  cases: cases.map((c) => ({
    id: c.id,
    reasonKind: c.reasonKind,
    general: c.general,
    ballHost: c.ballHost,
    native: c.native,
  })),
};
writeFileSync(outPath, JSON.stringify(expectations, null, 2) + '\n');

const accepts = cases.filter((c) => c.ballHost === 'accept').length;
console.log(`conformance: ${cases.length} cases, ${accepts} ball-host accepts, `
  + `expectations -> levels/fixtures/ball-conformance-expectations.json`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  console.error(`${failures.length} conformance mismatch(es)`);
  process.exit(1);
}
console.log('JS verdicts match every declared case; no drift.');
