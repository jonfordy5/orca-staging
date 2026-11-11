# WO-03 character motion baseline

Measured November 10, 2026 (America/Chicago; November 11 UTC) against merged main `fdb37c87f6e3f781d5a866b9811878d84e432471` (approved WO-02, PR #50), before WO-03 runtime edits. A complete `git archive` of that commit was frozen in `work/wo03-baseline-source/` before parallel implementation began. The capture server serves only that source directory; it cannot fall back to edited checkout files.

WO-03 covers original procedural character animation: movement transitions, directional dodging, melee and casting blends, enemy telegraphs and reactions, and consistent silhouettes. The existing Vault, equipment, three demonstration relics, controls, combat rules, account/consent eligibility and research behavior remain the reference. This evidence makes no claim of owner approval, production deployment, multiplayer or consumer-hardware performance.

## Verified baseline

- `node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs scripts/test-orca-legends-audio.mjs`: **31 passed, 0 failed** against the frozen source.
- `CHROME_BIN=/usr/bin/chromium node scripts/test-orca-legends-browser.cjs`: **all 22 integrated browser groups passed** against the frozen source.
- The integrated browser run exercised real keyboard/mouse movement, sprint, camera orbit, collision, pause, inventory/equipment, all three chests, light/heavy melee, guard, dodge, spell, both encounters, starter-equipment victory through timed parries, replay, defeat, settings and public signed-out denial.
- No JavaScript/console errors or live research/API requests occurred in the integrated run. Local development eligibility does not establish a real signed-in contributor entitlement.

The logs are `work/wo03-baseline-node.log` and `work/wo03-baseline-browser.log`. Baseline mechanics include light contact at 0.22 / 0.56 seconds, heavy contact at 0.48 / 0.94 seconds, a 0.48-second dodge with 0.38-second invulnerability, 24 dodge stamina, and instant F projectile launch for 28 mana with a 3.6-second cooldown. Warden strike windup is 0.9 seconds; champion strike and Ember Ring windups are 0.72 and 1.1 seconds. These are simulation timings, independent of the offline evidence video's playback rate.

## Reproduce the evidence

[`capture-orca-legends-animation.cjs`](../scripts/capture-orca-legends-animation.cjs) uses genuine Playwright keys and mouse events for movement, sprint, camera drag, guard, directional dodge, light/heavy attacks and casting. Test-only hooks arrange position, advance manual time, render and read snapshots. Enemy windups and actual damage come from the unchanged AI and combat code.

```sh
CHROME_BIN=/usr/bin/chromium \
ANIMATION_CAPTURE_ROOT="$PWD/work/wo03-baseline-source" \
CAPTURE_DIR="$PWD/work/wo03-before" \
CAPTURE_LABEL=before \
CAPTURE_REVISION=fdb37c87f6e3f781d5a866b9811878d84e432471 \
node scripts/capture-orca-legends-animation.cjs
```

For after evidence, set `ANIMATION_CAPTURE_ROOT` to a frozen archive of the reviewed candidate and supply its revision. Matching filenames and inputs make the two sources comparable. `CAPTURE_STILLS_ONLY=1` skips real RAF performance sampling; `CAPTURE_VIDEO=0` skips frame capture/encoding. RAF sampling and video capture are enabled by default. `ffmpeg` is optional: a failed/missing encoder is recorded and the original PNG frames remain available.

Every screenshot renders the actual Babylon scene, waits for shader/material readiness while simulation is frozen, then renders again. The camera starts at the normal gameplay zoom; the movement sequence uses a real 50-pixel middle-mouse horizontal drag. The UI and transient start toast are preserved. `CAPTURE_MOVIE_ONLY=1` refreshes the movie and ten changed dodge/cast stills, skips melee/champion/RAF work and writes `measurements-movie.json`. Baseline evidence combines same-source supplements by capture name and keeps the existing independent RAF measurements. Both high quality / normal motion and low quality / reduced motion have matching stills. The latter filenames end in `-reduced`.

| Stills | Actual state |
|---|---|
| `idle`, `walk`, `sprint` | Idle readiness, W walking, then W + Shift sprinting. |
| `turn`, `brake`, `guard` | Switch W to D during sprint, release direction/Shift, then hold Q. |
| `dodge`, `landing`, `dodge-recovered` | A renewed sprint directly into A + Space directional dodge, its late 0.4-second pose (the file named `landing`), then recovery at 0.8 seconds. |
| `cast`, `cast-recovered` | Real F press after dodge recovery, immediate projectile and subsequent follow-through. |
| `enemy-windup`, `enemy-commit` | Warden AI's own early and late windup from `(0, 5.8)`. |
| `enemy-contact`, `enemy-recovery` | The same AI strike damages the hero and enters recovery. |
| `light-anticipation`, `light-contact`, `heavy-reaction` | Real left-mouse strike, then real R heavy contact and enemy recoil. |

## Motion playback and performance boundaries

`motion-fixed-step.webm` is a **4.0-second offline simulation playback**, containing 60 original 960 × 640 screenshot frames encoded at 15 fps. Each frame advances four fixed 1/60-second simulation updates. The video joins movement/guard (1.2 seconds), renewed sprint directly into directional dodge/landing (1.2), cast/recovery (0.4) and Warden windup/contact/recovery (1.2). Cuts arrange those independent scenes; no generated/interpolated frames, altered poses or retimed attacks are used. Raw frames and the frame-by-frame snapshots remain in the local capture directory. The baseline and candidate use the same schedule.

Software WebGL renders too slowly here for a truthful real-time animation-feel judgment. Fixed-step playback lets reviewers inspect motion timing without presenting cloud wall-clock rendering speed as gameplay performance. It is silent because sound is outside WO-03. A hardware browser remains necessary for subjective keyboard/mouse feel and real-time smoothness review.

The separate RAF samples use one second of warmup, at least four seconds of real wall-clock sampling, the existing 50 ms delta cap and W + Shift held down. Chromium uses SwiftShader at 960 × 640 with volume muted. Other test browsers must be closed. High/normal and low/reduced settings change two variables and do not isolate either cost. Raw `measurements.json` records settings, source revision/root, every capture snapshot, video frame schedule, complete scene counts, errors and mean/median/p95 RAF intervals.

The final baseline samples were captured with the same harness and frozen source.

| Setting | Frames / elapsed | Mean interval | Median interval | 95th percentile |
|---|---:|---:|---:|---:|
| High, reduced motion off | 18 / 4,048.7 ms | 224.93 ms | 216.7 ms | 483.3 ms |
| Low, reduced motion on | 26 / 4,328.4 ms | 166.48 ms | 166.7 ms | 333.4 ms |

The complete idle scene contains 522 meshes / 64 materials on High and 463 / 64 on Low/reduced. A live projectile adds one mesh/material. The source, settings and full precision sample values in JSON are authoritative. These short, variable shared-executor samples establish neither consumer FPS nor a performance improvement/regression.

The baseline capture completed without JavaScript/console errors. Both settings produced actual light damage 145 → 128 and heavy damage 128 → 100; the real Warden strike damaged the hero. Additional `champion-strike` and `champion-shockwave` stills (plus reduced variants) reach Varr by real starter R attacks, E chest interactions and arena traversal, then capture his own strike and third-attack Ember Ring before contact. No hook changes health, actions, inventory or AI. Those four stills were appended from a same-source `CAPTURE_ENEMIES_ONLY=1` run; the flag provides a bounded way to refresh only Varr and writes `measurements-enemies.json`.

All 40 baseline stills, the 60 original video frames, WebM and bounded measurement JSON are in `work/wo03-before/`. Review JSON omits repeated inventory, item descriptions, chest lids and equipment colors. Video frame tuples document coordinates/actions without repeating the whole scene. Selected review artifacts are preserved in [`docs/evidence/wo-03/before/`](./evidence/wo-03/before/).

## Final paired capture

The final after capture serves the complete frozen candidate `da1e9f6` from `work/wo03-after-source/`, including the dodge continuity fixes and their regression tests. It completed all 40 matching stills and a 60-frame, 4.0-second VP9 clip at 960 × 640 / 15 fps, with no JavaScript/console errors. Before and after positions, velocities, facing, health, stamina, mana, action objects, guard state, spell timing and enemy health/actions match across all 40 capture snapshots. Complete scene mesh/material/light/effect/projectile counts also match at those states. This comparison supports preservation of the sampled behavior; the broader gameplay suites cover encounter completion and eligibility.

| Setting | Before mean / median / p95 | After mean / median / p95 |
|---|---:|---:|
| High, reduced motion off | 224.93 / 216.7 / 483.3 ms | 310.15 / 316.6 / 466.7 ms |
| Low, reduced motion on | 166.48 / 166.7 / 333.4 ms | 148.30 / 150.0 / 183.4 ms |

The after High sample recorded 13 frames over 4,031.9 ms; Low/reduced recorded 27 over 4,004.0 ms. These remain short shared-executor software-renderer samples, with a slower High mean and faster Low/reduced mean in this run. They establish no consumer-hardware frame-rate target or causal performance change.

Original movie frame `0012` provides the near-profile sprint/turn view; frames `0021`–`0025` show the renewed sprint directly entering a directional dodge. Visual inspection found coherent equipment/silhouette and progressive body lowering. The normal follow camera and cape partly obscure the knees during the forward-facing transition, so exhaustive adjacent-frame joint checks are the stronger evidence for the repaired knee discontinuity. Hardware review of keyboard/mouse feel remains an owner acceptance step.

All final local output is in `work/wo03-after/`. Selected matching stills, both clips and bounded raw JSON are the review artifacts under [`docs/evidence/wo-03/`](./evidence/wo-03/); original screenshot frames remain local and unmodified.
