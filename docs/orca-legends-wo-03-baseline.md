# WO-03 character motion baseline

Measured November 11, 2026 against merged main `fdb37c87f6e3f781d5a866b9811878d84e432471` (approved WO-02, PR #50), before WO-03 runtime edits. A complete `git archive` of that commit was frozen in `work/wo03-baseline-source/` before parallel implementation began. The capture server serves only that source directory; it cannot fall back to edited checkout files.

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

For after evidence, set `ANIMATION_CAPTURE_ROOT` to a frozen archive of the reviewed candidate and supply its revision. Matching filenames and inputs make the two sources comparable. `CAPTURE_STILLS_ONLY=1` skips real RAF performance sampling; `CAPTURE_VIDEO=0` skips frame capture/encoding. Both default to enabled. `ffmpeg` is optional: a failed/missing encoder is recorded and the original PNG frames remain available.

Every screenshot renders the actual Babylon scene, waits for shader/material readiness while simulation is frozen, then renders again. The camera starts at the normal gameplay zoom; the movement sequence uses a real 50-pixel middle-mouse horizontal drag. The UI and transient start toast are preserved. Both high quality / normal motion and low quality / reduced motion have matching stills. The latter filenames end in `-reduced`.

| Stills | Actual state |
|---|---|
| `idle`, `walk`, `sprint` | Idle readiness, W walking, then W + Shift sprinting. |
| `turn`, `brake`, `guard` | Switch W to D during sprint, release direction/Shift, then hold Q. |
| `dodge`, `landing`, `dodge-recovered` | A + Space directional dodge, its late 0.4-second pose (the file named `landing`), then recovery at 0.8 seconds. |
| `cast`, `cast-recovered` | Real F press after dodge recovery, immediate projectile and subsequent follow-through. |
| `enemy-windup`, `enemy-commit` | Warden AI's own early and late windup from `(0, 5.8)`. |
| `enemy-contact`, `enemy-recovery` | The same AI strike damages the hero and enters recovery. |
| `light-anticipation`, `light-contact`, `heavy-reaction` | Real left-mouse strike, then real R heavy contact and enemy recoil. |

## Motion playback and performance boundaries

`motion-fixed-step.webm` is a **3.6-second offline simulation playback**, containing 54 original 960 × 640 screenshot frames encoded at 15 fps. Each frame advances four fixed 1/60-second simulation updates. The video joins movement/guard (1.2 seconds), directional dodge/landing (0.8), cast/recovery (0.4) and Warden windup/contact/recovery (1.2). Cuts arrange those independent scenes; no generated/interpolated frames, altered poses or retimed attacks are used. Raw frames and the frame-by-frame snapshots remain in the local capture directory. The baseline and candidate use the same schedule.

Software WebGL renders too slowly here for a truthful real-time animation-feel judgment. Fixed-step playback lets reviewers inspect motion timing without presenting cloud wall-clock rendering speed as gameplay performance. It is silent because sound is outside WO-03. A hardware browser remains necessary for subjective keyboard/mouse feel and real-time smoothness review.

The separate RAF samples use one second of warmup, at least four seconds of real wall-clock sampling, the existing 50 ms delta cap and W + Shift held down. Chromium uses SwiftShader at 960 × 640 with volume muted. Other test browsers must be closed. High/normal and low/reduced settings change two variables and do not isolate either cost. Raw `measurements.json` records settings, source revision/root, every capture snapshot, video frame schedule, complete scene counts, errors and mean/median/p95 RAF intervals.

The final baseline samples were captured with the same harness and frozen source.

| Setting | Frames / elapsed | Mean interval | Median interval | 95th percentile |
|---|---:|---:|---:|---:|
| High, reduced motion off | 18 / 4,048.7 ms | 224.93 ms | 216.7 ms | 483.3 ms |
| Low, reduced motion on | 26 / 4,328.4 ms | 166.48 ms | 166.7 ms | 333.4 ms |

The complete idle scene contains 522 meshes / 64 materials on High and 463 / 64 on Low/reduced. A live projectile adds one mesh/material. The source, settings and full precision sample values in JSON are authoritative. These short, variable shared-executor samples establish neither consumer FPS nor a performance improvement/regression.

The baseline capture completed without JavaScript/console errors. Both settings produced actual light damage 145 → 128 and heavy damage 128 → 100; the real Warden strike damaged the hero. Additional `champion-strike` and `champion-shockwave` stills (plus reduced variants) reach Varr by real starter R attacks, E chest interactions and arena traversal, then capture his own strike and third-attack Ember Ring before contact. No hook changes health, actions, inventory or AI. Those four stills were appended from a same-source `CAPTURE_ENEMIES_ONLY=1` run; the flag provides a bounded way to refresh only Varr and writes `measurements-enemies.json`.

All 40 baseline stills, the 54 original video frames, WebM and bounded measurement JSON are in `work/wo03-before/`. The complete original snapshot output is retained locally as `measurements-full-local.json`; review JSON omits repeated inventory, item descriptions, chest lids and equipment colors. Video frame tuples document coordinates/actions without repeating the whole scene. Selected review artifacts are preserved in [`docs/evidence/wo-03/before/`](./evidence/wo-03/before/).
