# Link-time inputs per program — 2026-09-09 (MUSE-18)

What the compiler links, measured from the EMITTED source (the text after
`fragFor` / builder interpolation), never from the builder modules. Method
is the `/tmp/muse18-analyze.mjs` scratch probe (stays out of the repo);
every number below re-derivable with the commands shown. Link medians are
copied from `link-time-2026-09.md` (lead, RTX 5070 Ti, ANGLE D3D11); they
were not re-measured here and no browser ran here.

Commands (repo root, WSL node v22.23.2):

```sh
node -e "import('./shader.js').then(async ({VERT, fragFor, LINE_VERT, LINE_FRAG}) => {
  const {SPACES} = await import('./engine/geometry/registry.js');
  for (const s of SPACES) require('fs').writeFileSync('/tmp/emit-' + s.key + '.glsl', VERT + '\n' + fragFor(s.key));
})"
node /tmp/muse18-analyze.mjs   # chars, code lines, fn defs, call sites, fors, defines
node -e "import('./shader.js').then(({VERT, fragFor}) => {  # h3-vs-e3t diff
  const a = (VERT + fragFor('h3')).split('\n'), b = (VERT + fragFor('e3t')).split('\n');
  const sb = new Set(b);
  console.log(a.filter(l => !sb.has(l))); })"
```

"Program" below is vertex + fragment as linked (`VERT` + fragment; the
vertex adds 3 lines, one `main`, no loops). `calls` = call sites of
defined functions (built-ins excluded). `for a/b` = compile-time-constant
bounds / total `for` loops; a bound is constant when nothing but numbers,
operators and ALL_CAPS defines remains after removing the loop variable
(uniforms, locals and `rolled(...)` make it non-constant).
`#defines` = directives present in the emitted text ("actually reachable"
as emitted; `#if` evaluation is NOT done here).

| program | chars | lines | fns | calls | top fn | for | defs | link med |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scene (hyperbolic) | 109405 | 1236 | 49 | 171 | hDist x21 | 22/31 | 22 | 9.0 s |
| scene (H^2 x R) | 109405 | 1236 | 49 | 171 | hDist x21 | 22/31 | 22 | 5.9 s |
| scene (spherical) | 109405 | 1236 | 49 | 171 | hDist x21 | 22/31 | 22 | 4.1 s |
| scene (S^2 x R) | 109405 | 1236 | 49 | 171 | hDist x21 | 22/31 | 22 | 4.1 s |
| scene (E^3 / lattice) | 109405 | 1236 | 49 | 171 | hDist x21 | 22/31 | 22 | 3.3 s |
| scene (Nil) | 12386 | 208 | 15 | 31 | hDist x6 | 4/7 | 1 | 0.3 s |
| scene (Sol) | 2629 | 59 | 5 | 33 | pd x20 | 2/2 | 1 | 0.2 s |
| scene (SL2R cover) | 2640 | 59 | 5 | 33 | pd x20 | 2/2 | 1 | 0.2 s |
| lines | 208 | 8 | 0 | 0 | — | 0/0 | 0 | 0.0 s |
| ball first person | 6638 | 112 | 2 | 2 | ballRayHit x1 | 4/4 | 4 | 0.7 s* |
| ball preview | 1011 | 30 | 2 | 2 | ballRayHit x1 | 0/0 | 0 | — |

`*` ball-FP 0.7 s is from `page-check --ball-lab` on a cold profile, not
`link-time.js`; ball preview unmeasured (both per `link-time-2026-09.md`
limits). Non-constant loop bounds seen: `uMarkN`, `uCutN`, locals
(`count`, `steps`, `n`), `rolled(...)`, `depth`. Emitted `#define` sets:
the five share `G_H3 G_S3 G_H2R G_S2R G_E3T G_NIL GEOM IS_PRODUCT kS(x4)
IS_FLAT` + 5 more; Nil/Sol/SL2R carry only `GEOM`; ball-FP has
`MAX_BALLS MAX_PLANES MAX_PORTALS MAX_BOUNCES`; lines/preview have none.

## Which column orders link time? None of them, fully

The five slow programs are TEXTUALLY ONE program: h3 vs e3t emitted
sources differ in exactly one line (`#define GEOM (0)` vs `(4)`; 2213
lines each, 1 line unique per side). So every parsed column ties across
the 9.0 → 3.3 s spread by construction — the difference lives in which
`#if` branches the preprocessor keeps, which this parse does not
evaluate. That is consistent with the quotient-apparatus mechanism, but
these columns do not independently establish it.

Across groups, total size comes closest (208–2640 chars at 0.0–0.2 s;
12386 at 0.3 s; 109405 at 3.3–9.0 s) but inverts Nil (12386 chars, 0.3 s)
against ball-FP (6638 chars, 0.7 s*), and fn-defs inverts worse (FP has 2
functions at 0.7 s*, Sol has 5 at 0.2 s). No single column orders all
eleven rows. An honest "no column explains it" for the full set, with
the five-way tie as the precise reason.
