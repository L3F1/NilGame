# MUSE-70 saved H3 audit

Failures first: zero production failures. Two audit-script bugs (R-scaled probe points outside the capped domain; malformed assert.throws) were fixed in the truth file; no production file touched. Isolated mutant `B>|A|+eps` to `B>0` fails truth 2/162: off-centre on-plane tangential rays become false misses. Guard band is load-bearing; scratch copy removed.

Verdict: outward rule holds over the corpus. Outward on/near-plane starts never enter (signed height strictly increasing along 8 samples, never negative); ambiguous and inward on-plane starts stay unresolved; domain-limited queries never claim a full miss. No counterexamples: 9 saved E3/H3/E3 docs (R .5/8/10000 x base, rotated-90, off-centre anchors), 162 queries: 18 hit, 42 miss, 102 unresolved. Front-side inward rays aimed at the disc still hit (sanity). Snapshot holds (post-compile radius edit leaves field distance unchanged); persistence holds (document round-trips deep-equal). All 9 unsupported intents refuse: default-compiler H3 gate, renderData, floor, subtract op, oversize ball/extent, box solid, second spawn, anchor radius beyond R. Fixture E3/H3/E3 traversal still completes with 2 crossings.

Commands (LeoPC/WSL, Node v22.23.2, base 41f1548): `node hyperbolic-region-truth.test.js` pass; `node hyperbolic-region.test.js` pass (preserved); `node tools/host-probe.js` once: browser checks UNAVAILABLE (no worker serving), Node-only per task. Mutant run in /tmp copy only.

Limitations: sampled evidence, not proof over all authored inputs. Audit shares metric functions (ambientDot, step, boundaryDistance, signedHeight) with the implementation, so a common-mode metric bug would be invisible. Coefficient/physical guard bands remain heuristic per H3_QUERY_CONTRACT. R=10000 domain capped at extent 12, so far-field asymptotics untested. No renderer, full suite, or commits per scope; no repair or integration attempted.

READY FOR REVIEW
