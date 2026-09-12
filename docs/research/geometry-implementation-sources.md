# Geometry implementation sources - lead review of MUSE-72

Reviewed 2026-09-12 at NilGame26c0a43. MUSE-72 accepted as a corrected research
index, not blanket code-import approval. No external code added to the project.
URLs returning200 did not suffice: source contents and licensing were inspected.

## Immediate decisions

- Reuse our existing geometry-specialized shaders, metric routines, CPU camera
  packing and material code where their assumptions hold. These are the first
  implementation references for the connected renderer.
- Consult the Thurston paper for future geometry/quotient algorithms; obtaining
  a verified upstream source license is still required before copying its code.
- HyperRogue is a substantial technical reference, not merely a feel reference.
  Its GPL-covered implementation is not a drop-in permissive code donor.
- Bruneton's inspected shader files are a permissive candidate for the later
  black-hole experiment; they do not solve current portal precision issues.

## Sources, verified scope and reuse status

### 1. Matched portals

[Celinska-Kopczynska and Kopczynski, Bridges2022, pp297-300](https://archive.bridgesmathart.org/2022/bridges2022-297.pdf).
Read the interface conditions on p298: equal intrinsic metrics plus their
extrinsic-curvature constraint preclude direct E3/H3 under those conditions.
This does not prohibit NilGame's deliberately different gameplay mapping.
Retain the distinction in PORTAL_PRIOR_ART.md. Paper is a mathematical reference;
no software license follows merely from downloading the PDF.

### 2. All-eight geometry rendering

[Coulon, Matsumoto, Segerman, Trettel, arXiv2010.15801v2](https://arxiv.org/abs/2010.15801v2).
Identity and abstract checked: ray marching, quotient manifolds/orbifolds and
non-Euclidean Phong lighting. A useful algorithms reference, not evidence that
our analytic event solver or gameplay portal map is their implementation.
This review did not audit all140 pages or independently rederive every formula.

[PLM author source](https://plmlab.math.cnrs.fr/3-dimensional.space/source):
UNVERIFIED source/license. Web retrieval returned unrelated prose; direct API
retrieval failed certificate verification and raw LICENSE could not be read.
Do not interpret that response as repository content or assert a cause for it.
The historical symbols raymarch/creepingFlow/teleport remain search leads, not
newly verified source-file citations. Gate remains closed pending authenticated
primary repository/package provenance and its actual license text.

### 3. HyperRogue - technical precedent, GPL-2.0-or-later

Inspected revision `f217b53b02982d86c555b235964822952c2dc07f`:
[hyper.cpp](https://github.com/zenorogue/hyperrogue/blob/f217b53b02982d86c555b235964822952c2dc07f/hyper.cpp)
contains the version2-or-later grant;
[COPYING](https://github.com/zenorogue/hyperrogue/blob/f217b53b02982d86c555b235964822952c2dc07f/COPYING)
contains GPLv2. File-level starting points inspected:
[intra.cpp](https://github.com/zenorogue/hyperrogue/blob/f217b53b02982d86c555b235964822952c2dc07f/intra.cpp)
for interconnected spaces and portal state;
[raycaster.cpp](https://github.com/zenorogue/hyperrogue/blob/f217b53b02982d86c555b235964822952c2dc07f/raycaster.cpp)
for the raycaster and portal-connection textures;
[nonisotropic.cpp](https://github.com/zenorogue/hyperrogue/blob/f217b53b02982d86c555b235964822952c2dc07f/nonisotropic.cpp)
for Nil/Sol machinery. Corrects Muse's characterization as primarily game feel.
These are entry points, not a completed algorithm/correctness audit. Any code
reuse requires an explicit license-compatibility and distribution plan; GPL is
not a ban on commercial use. No such code imported in this review.

### 4. WLU bundle - inspectable, license not verified

[Examples](https://3d.wlu.edu/vr/examples/) include quotients, not just simply
connected geometries: quaternion-group S3, product quotients and Nil mappings.
Fetched [spherical bundle](https://3d.wlu.edu/vr/build/thurston/thurstonSph.js),
311893 bytes, SHA256 `fd9258b0d93f9c6946d9803429bd74ef3c9cb593555866a066ca4346c685d65d`.
It is a generated JavaScript bundle with shader strings. No project license
was established from the page/bundle. Dependency licenses do not establish the
bundle author's terms. Read-only example reference; no copying clearance.

### 5. Curved Spaces - source available, GPL-2.0-or-later

[Official page](https://www.geometrygames.org/CurvedSpaces/index.html.en) links
[source ZIP](https://www.geometrygames.org/CurvedSpaces/CurvedSpaces-Src.zip)
and GPL. Inspected ZIP SHA256
`94e8d6492c4cb503414a98412ff3b42b4339027611d0feb1440c82f44a1746ca`.
`04 Curved Spaces/TermsOfUse.txt` explicitly grants GPLv2-or-later (2022 Weeks).
`Source - common/C code/CurvedSpacesTiling.c` constructs a tiling from a
Dirichlet domain; `ConstructHolonomyGroup` is a concrete starting point.
Useful for quotient topology and duplicate transforms; not a licensed-as-
permissive shader replacement. Same code-reuse gate as HyperRogue. Corrects
Muse's unknown source/license status.

### 6. Hyperbolica

[Author's store page](https://codeparade.itch.io/hyperbolica): experience and art
reference. This page is not a reusable-source license. Do not infer that no
related public code exists from a store listing; no specific donor file was
verified in this review.

### 7. Bruneton black-hole renderer - BSD-3-Clause candidate

Inspected revision `e72b3f293409893a6fa25528b29572c96fc57f57`:
[LICENSE](https://github.com/ebruneton/black_hole_shader/blob/e72b3f293409893a6fa25528b29572c96fc57f57/LICENSE),
[black_hole/functions.glsl](https://github.com/ebruneton/black_hole_shader/blob/e72b3f293409893a6fa25528b29572c96fc57f57/black_hole/functions.glsl)
(TraceRay/table lookup machinery), and
[black_hole/model.glsl](https://github.com/ebruneton/black_hole_shader/blob/e72b3f293409893a6fa25528b29572c96fc57f57/black_hole/model.glsl)
(SceneColor/shading). Both file headers carry the BSD terms. Preserve notices,
conditions and disclaimer in source; reproduce required notices for binary
redistribution; no endorsement implication. Audit separately any data/assets
or dependencies actually selected later.
[Author documentation](https://ebruneton.github.io/black_hole_shader/index.html)
explains precomputed beam/scene intersections for a non-rotating black hole.
This is specialized curved-light propagation, not a general changing-metric
portal engine or a way to remove our S3 tangency bands.

## Units and outstanding work

Do not require every future adapter to use our current H3 trial envelope R8.
Convert each source's normalization to its adapter's declared physical units;
recheck distances, tangent transport, radius and tolerances. Muse's blanket
instruction to rescale all reuse into the H3 envelope was too broad.

Review is complete with the above decisions. Remaining copying gates are
specific: PLM provenance/license, WLU project license, and GPL compatibility
if GPL implementation reuse is selected. No need to repeat this whole survey.
Retrieved source archives remain ignored under .agent-bridge, outside shipped
files; links/revisions/hashes above are the durable evidence. Docs-only review:
no runtime/test changes, no new test-suite claim.
