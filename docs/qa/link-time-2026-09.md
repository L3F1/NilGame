# Shader link time per geometry — 2026-09-09 (MUSE-15, run by the lead)

Machine: Windows 11, NVIDIA GeForce RTX 5070 Ti, driver reported by the tool as
`ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0
ps_5_0, D3D11)`. Node v24.20.0, Chrome via `tools/link-time.js`, which acquires
a fresh cold profile per program. Three runs of the whole tool, reported below
as run 1 / run 2 / run 3.

Cold-cache method: `tools/link-time.js` is the existing tool and it takes a
COLD profile per invocation — the profile directory is new, so the driver's
shader cache is empty. This was not re-engineered for the measurement; the same
tool produced the 8.4 s figure that decision 001 cites, so the numbers are
comparable to it.

## Results

| program | run 1 | run 2 | run 3 | min | median | max |
| --- | --- | --- | --- | --- | --- | --- |
| scene (hyperbolic) | 10.8 s | 8.9 s | 9.0 s | 8.9 | **9.0** | 10.8 |
| scene (H^2 x R) | 5.9 s | 6.8 s | 5.9 s | 5.9 | **5.9** | 6.8 |
| scene (spherical) | 4.1 s | 4.2 s | 3.8 s | 3.8 | **4.1** | 4.2 |
| scene (S^2 x R) | 4.1 s | 4.3 s | 4.0 s | 4.0 | **4.1** | 4.3 |
| scene (E^3 / lattice) | 3.3 s | 3.4 s | 3.2 s | 3.2 | **3.3** | 3.4 |
| scene (Nil) | 0.3 s | 0.3 s | 0.3 s | 0.3 | **0.3** | 0.3 |
| scene (Sol) | 0.2 s | 0.2 s | 0.2 s | 0.2 | **0.2** | 0.2 |
| scene (SL2R cover) | 0.2 s | 0.2 s | 0.2 s | 0.2 | **0.2** | 0.2 |
| lines | 0.0 s | 0.0 s | 0.0 s | 0.0 | **0.0** | 0.0 |
| ball first person | — | — | — | — | **0.7** | — |

Compile time was 0 ms for every program in every run. On ANGLE the GLSL becomes
HLSL at compile time and the D3D compiler runs at LINK time, so compile time
carries no information here and link time carries all of it.

The ball program's 0.7 s is from `page-check --ball-lab` on a cold profile on
the same machine, not from `link-time.js`, which does not include the two ball
programs. That gap is worth closing and is recorded as such rather than papered
over: `BALL_PREVIEW_GLSL` was not measured at all.

## What the numbers say

Not a conclusion about the host — that is not this document's job — but the
shape is worth stating because it is not what the single 8.4 s figure suggests.

**The cost is concentrated in one program.** Hyperbolic at ~9 s is 45 times the
Lie-group worlds at 0.2 s, and 13 times the editor's own program at 0.7 s. The
spread across the eight geometries is two orders of magnitude.

**And it tracks the quotient, not the curvature.** The three worlds that link
in 0.2–0.3 s are exactly the three with no fundamental domain. `main.js` states
the mechanism directly: for a world without a quotient "the fundamental domain,
the face scan, the exact exit solve, the fold loop, the portals and all 39
level primitives are unreachable, and the preprocessor lets the D3D compiler
see that BEFORE it starts inlining."

So "the browser is slow to compile shaders" is too coarse. **The H3 quotient
program is slow to compile; everything else is fast.** H^2 x R at 5.9 s is the
second worst and also has substantial apparatus; the Lie-group labs are nearly
free.

**Run 1 is consistently the slowest.** Hyperbolic 10.8 s against 8.9 and 9.0.
Some of that is first-invocation cost outside the shader itself. Reporting a
single sample would have overstated the figure by 20%.

## Limits

- Source length and primitive counts were NOT recorded per program. MUSE-15
  asked for them, to answer what link time scales with. The quotient/no-quotient
  split above is suggestive but it is one binary variable across nine points,
  which is not enough to call it the cause.
- Only one machine, one driver, one Chrome. ANGLE D3D11 is the case that has
  bitten this project; other back ends are unmeasured here.
- `BALL_PREVIEW_GLSL` unmeasured; `BALL_FIRST_PERSON_GLSL` measured by a
  different tool on a different code path.

## Raw output, run 3

```
driver: ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)
ok   scene (hyperbolic): compile 0 ms, link 9.0 s
ok   scene (spherical): compile 0 ms, link 3.8 s
ok   scene (H^2 x R): compile 0 ms, link 5.9 s
ok   scene (S^2 x R): compile 0 ms, link 4.0 s
ok   scene (E^3 / lattice): compile 0 ms, link 3.2 s
ok   scene (Nil): compile 0 ms, link 0.3 s
ok   scene (Sol): compile 0 ms, link 0.2 s
ok   scene (SL2R cover): compile 0 ms, link 0.2 s
ok   lines: compile 0 ms, link 0.0 s
```

Run 1 additionally printed, on the hyperbolic program:

```
WARN scene (hyperbolic): compile 0 ms, link 10.8 s
     Something is being inlined or unrolled more than once.
     See the inlining rule in CLAUDE.md, Rendering gotchas.
```

That warning is the tool's own budget threshold, not a new defect: the same
program links at 8.9–9.0 s on the other two runs, below the threshold. It is
worth knowing that the program sits right on the line.
