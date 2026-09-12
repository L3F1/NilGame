# Candidate transfer GPU readback, 2026-09-12

Base bf60cbe, LeoPC/Windows/Node24.20.0. Added the isolated candidate evaluation
in engine/geometry/portal-transfer-gpu.js and a small GPU probe in
app/portal-transfer-gpu-probe.js. The live connected trace is unchanged.

The GLSL uses the stable small-angle sinc/cosine construction from the interval
reference and explicitly parallel-transports and normalizes the outgoing
direction. It owns evaluation only: no aperture selection, rim clearance,
collision, remaining-time policy or propagated error output is implied.

`node tools/check-queue.js page-check --three-geometry` and the same with
`--sw` each passed8 browser checks, including the existing edit/route/census.
RTX5070Ti via ANGLE D3D11 and SwiftShader each enclosed540 read-back scalar
components across60 transfers. Cases include central/off-center rays, slanted
directions, and original plus rotated/translated frames. Every component of
position/direction/crossing distance is checked against the CPU interval bounds;
maximum absolute difference from the existing CPU portal formula was
2.442921238632323e-7 on each backend. This aggregate mixes coordinate and
distance components and is not a universal positional error bound.

The probe compiles a second, isolated shader with parallel transport omitted.
Each backend rejects it because a component leaves its reference interval.
The real program and mutant are deleted after the check. No runtime source is
mutated and no visual tolerance is loosened.

Packets: .agent-bridge/three-editor-{real,sw}.json, portal-transfer-gpu record.
Full ray census remains in JSON; console output now omits the repeated scene,
pose and individual samples to avoid needless log/token volume.

Limits: these are sampled tests, not a proof of all backend instruction paths.
Input perturbations use the declared compiled inputs plus float32 encoding;
arbitrary upstream uncertainty, repeated crossings and GPU interval propagation
are not tested by this probe. It verifies the candidate shader, not the old
connected shader's algebraically equivalent transfer. The52 gallery numerical
refusals remain unchanged. No render improvement is claimed.

MUSE-74 was dispatched via the installed Muse CLI in an isolated checkout at
bf60cbe: independent CPU perturbation corpus, no kernel repairs, no GPU jobs.
Review its report before treating its findings as accepted. Claude was not
dispatched because renewed availability has not been confirmed this session.

Next lead work: connect the chosen float32 transfer evaluation to explicit
uncertainty propagation and width-aware spherical root event ordering. Keep
the existing live guards until that complete path passes the broader corpus.

Full approved-host Node validation:130/130 suites passed via node tools/test.js;
log .agent-bridge/portal-transfer-gpu-suite.log. Muse audit still running at
commit preparation; it has not been accepted or integrated.
