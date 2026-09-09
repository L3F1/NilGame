// Uniform coverage: every uniform a compiled program declares must be both
// LOCATED (getUniformLocation) and SET (gl.uniform*) by its host module.
//
// A declared-but-never-set uniform reads as zero: the shader compiles, the
// program links, and the picture is merely wrong with no error anywhere.
// A set-but-never-declared name is a rename that left a dead call behind.
// Both halves are required for every name; either direction fails loudly.
//
// Textual analysis of current sources, no browser. It pins the source
// contract, not driver behavior: a uniform the compiler optimizes out still
// needs both halves here (a null location set is a silent no-op, which is
// exactly the silence this test exists to prevent). Conditional sets count:
// the question is never-set, not set-every-frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERT, LINE_VERT, LINE_FRAG, fragFor } from './shader.js';
import { SPACES } from './engine/geometry/registry.js';
import {
  BALL_PREVIEW_GLSL, BALL_FIRST_PERSON_GLSL,
} from './engine/geometry/ball-shader.js';

const stripGLSL = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const stripJS = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

// Parse `uniform <type> <a>[N], <b>, ...;` — the Lie programs group several
// names in one declaration, so a first-name-only parse silently drops most
// of their uniforms.
function parseGLSLUniforms(src) {
  const names = new Set();
  for (const m of stripGLSL(src).matchAll(/uniform\s+\w+\s+([^;]+);/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().match(/^(\w+)/)?.[1];
      if (name) names.add(name);
    }
  }
  return names;
}

// main.js style: `key: gl.getUniformLocation(prog, 'uName')` pairs plus
// `gl.uniform*(U.key` / `gl.uniform*(UL.key` set sites.
function analyzeMainHost(src) {
  const clean = stripJS(src);
  const alias = new Map();
  for (const m of clean.matchAll(/(\w+)\s*:\s*gl\.getUniformLocation\(\s*\w+\s*,\s*'(\w+)'\)/g)) {
    alias.set(m[1], m[2]);
  }
  const set = new Set(), unknownAlias = [];
  for (const m of clean.matchAll(/gl\.uniform\w+\(\s*(?:U|UL)\.(\w+)/g)) {
    if (alias.has(m[1])) set.add(alias.get(m[1]));
    else unknownAlias.push(m[1]);
  }
  return { located: new Set(alias.values()), set, unknownAlias };
}

// app/ball-lab.js style: one `const U = Object.fromEntries([...])` location
// table of string literals, then `gl.uniform*(U.uName` set sites where the
// alias IS the GLSL name. A name in the table alone is lookup, not a set.
function analyzeBallLabHost(src) {
  const clean = stripJS(src);
  const table = clean.match(/const U = Object\.fromEntries\(\[([\s\S]*?)\]\)/);
  assert.ok(table, 'ball-lab location table not found; host refactored, update this test');
  const located = new Set([...table[1].matchAll(/'(\w+)'/g)].map((m) => m[1]));
  const set = new Set(
    [...clean.matchAll(/gl\.uniform\w+\(\s*U\.(\w+)/g)].map((m) => m[1]));
  return { located, set, unknownAlias: [] };
}

const mainSrc = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
const ballLabSrc = readFileSync(new URL('./app/ball-lab.js', import.meta.url), 'utf8');
const MAIN = analyzeMainHost(mainSrc);
const BALLLAB = analyzeBallLabHost(ballLabSrc);

const pairs = [
  ...SPACES.map((s) => ({
    program: `world:${s.key}`, src: VERT + '\n' + fragFor(s.key),
    host: MAIN, hostName: 'main.js',
  })),
  {
    program: 'lines', src: LINE_VERT + '\n' + LINE_FRAG,
    host: MAIN, hostName: 'main.js',
  },
  {
    program: 'ball-first-person', src: VERT + '\n' + BALL_FIRST_PERSON_GLSL,
    host: BALLLAB, hostName: 'app/ball-lab.js',
  },
];

// BALL_PREVIEW_GLSL has NO WebGL host in this repo: nothing compiles it in a
// browser page. Its string is consumed by the shader-compile check, the
// SDF/parity fixtures and the Godot text exporter (tools/ball-lab-export.js),
// which address uniforms by generated text, not by location. If a browser
// module ever compiles it, register that host in `pairs` and shrink this.
const PREVIEW_EXCEPTIONS = [
  {
    program: 'ball-preview',
    src: VERT + '\n' + BALL_PREVIEW_GLSL,
    expectedNames: ['uBall', 'uRes'],
    unhosted: ['uBall'],
    reason: 'no WebGL host compiles the preview program; uRes is covered under other pairs',
  },
];

const problems = [];
for (const { program, src, host, hostName } of pairs) {
  for (const name of [...parseGLSLUniforms(src)].sort()) {
    if (!host.located.has(name)) {
      problems.push(`declared-but-never-located: ${program} ${name} (${hostName})`);
    } else if (!host.set.has(name)) {
      problems.push(`declared-but-never-set: ${program} ${name} (${hostName})`);
    }
  }
}
// Set-but-never-declared is per HOST over the union of its programs: main.js
// sets every scene uniform on every frame whatever geometry is current, so a
// per-program reading would false-positive on every geometry-specific name.
const hostUnions = new Map();
for (const { src, hostName } of pairs) {
  if (!hostUnions.has(hostName)) hostUnions.set(hostName, new Set());
  for (const name of parseGLSLUniforms(src)) hostUnions.get(hostName).add(name);
}
for (const [hostName, host] of [['main.js', MAIN], ['app/ball-lab.js', BALLLAB]]) {
  for (const name of [...host.set].sort()) {
    if (!hostUnions.get(hostName).has(name)) {
      problems.push(`set-but-never-declared: ${hostName} sets ${name}, no compiled program declares it`);
    }
  }
  for (const alias of host.unknownAlias) {
    problems.push(`set-through-unknown-alias: ${hostName} sets U.${alias}, no location-table entry maps it`);
  }
}
for (const { program, src, expectedNames, unhosted, reason } of PREVIEW_EXCEPTIONS) {
  const names = [...parseGLSLUniforms(src)].sort();
  assert.deepEqual(names, [...expectedNames].sort(),
    `${program}: declared set changed; re-examine the exception: ${reason}`);
  for (const name of unhosted) {
    // Any WebGL host must name the uniform to locate it, whatever table
    // shape it uses — so a literal mention is the tripwire. uRes is
    // deliberately NOT pinned: it is hosted under other pairs.
    const mentioned = (s) => s.includes(`'${name}'`) || s.includes(`"${name}"`);
    const hosted = mentioned(stripJS(mainSrc)) || mentioned(stripJS(ballLabSrc));
    assert.equal(hosted, false,
      `${program}: ${name} gained a WebGL host; register it in pairs (${reason})`);
  }
}

assert.equal(problems.length, 0,
  `${problems.length} uniform-coverage problem(s):\n` + problems.join('\n'));
console.log(`uniform coverage: ${pairs.length} programs, `
  + `${[...hostUnions.values()].reduce((n, s) => n + s.size, 0)} declared names checked, `
  + `${PREVIEW_EXCEPTIONS.length} documented exception.`);
