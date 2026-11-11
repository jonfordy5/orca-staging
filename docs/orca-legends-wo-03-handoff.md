# WO-03 fluid combat motion handoff

Implements [Issue #52](https://github.com/jonfordy5/orca-staging/issues/52) on `feat/wo-03-fluid-combat-motion`, based on merged main `fdb37c87f6e3f781d5a866b9811878d84e432471`. PR #50 was verified merged before implementation, and its approved game sources were verified on main. WO-03 is for review only; nothing has been merged or deployed.

## Result and boundaries

Locomotion now follows the distance actually traveled after collision resolution. Walking into a wall stops the gait and footsteps instead of walking in place. Walk/sprint, start/stop, sideways travel and turns blend into restrained body lean, with ankle articulation keeping the existing boots level in support. A low combat stance supports guards and attack recovery. Dodge entry and landing follow the original dodge progress instead of switching the entire body instantly.

Warden and champion strikes now have distinct anticipation silhouettes, an observable held commitment and stronger recovery poses. The champion's Ember Ring has its own overhead ground-strike presentation. Animation samples the existing attack windup/impact ratio; it never drives damage or AI timing.

The approved hero light/heavy contact rotations, contact times and Cinderbolt release poses are retained. The lower-body stance is improved around those upper-body poses. Magic remains immediate, yields to melee/guard/dodge, and keeps the approved charge, trail, impact, lighting and audio. New measurements never write back to root position, facing, velocity, collision, health or resources.

The original controls, speed/acceleration, stamina economy, attack recovery, damage, hit arcs, dodge invulnerability, block/parry rules, enemy cooldowns and spell rules remain intact. The only audio integration change gates existing footsteps on actual movement and resets their clock on restart. No sound assets, world artwork, new spells, equipment, progression, account flow or research behavior were changed.

## Resources and motion settings

The motion helper updates one fixed scalar state per fighter, with wrapped gait phase/distance, exponential blending and bounded turn lean. Joint updates reuse the existing rig and arrays. A ten-float incoming-pose cache per fighter blends sprinting into dodges and handles immediately chained dodges. Two ankle TransformNodes per fighter add six fixed nodes to the scene; mesh, material, texture, light and feedback-pool counts are unchanged. Existing disposal recursively removes the new nodes. Restart and explicit relocation clear transient motion state.

Reduced motion attenuates locomotion bob, body lean, turn follow-through and secondary cloth motion while preserving the readable leg/action poses. Quality settings preserve the same rig, and both quality/motion variants are exercised. Pause freezes simulation and animation. The approved WO-01/02 feedback budgets and settings remain unchanged.

## Before/after evidence

[Baseline and method](orca-legends-wo-03-baseline.md) · [Before measurements](evidence/wo-03/before/measurements.json) · [After measurements](evidence/wo-03/after/measurements.json)

- [Before motion clip](evidence/wo-03/before/motion-fixed-step.webm)
- [After motion clip](evidence/wo-03/after/motion-fixed-step.webm)

The clips encode 60 original Chromium screenshots at 15 frames/second, advancing four real 1/60-second game updates per screenshot. They are **4-second offline simulation playback**, not live 15-FPS cloud recordings or a hardware performance claim. Inputs, source revision, frame/action tuples and real RAF samples are recorded in the measurement files. The same scripted keyboard/mouse sequence covers movement, sprint/turn/brake, guard, sprint-to-directional-dodge recovery, spell and actual Warden telegraph/contact. Varr stills are reached through real encounter/chest/arena progression, not fabricated enemy states.

| Detail | Before | After |
|---|---|---|
| Running-turn footwork | [Before](evidence/wo-03/before/sprint-profile.png) | [After](evidence/wo-03/after/sprint-profile.png) |
| Dodge posture | [Before](evidence/wo-03/before/dodge.png) | [After](evidence/wo-03/after/dodge.png) |
| Warden commitment | [Before](evidence/wo-03/before/enemy-commit.png) | [After](evidence/wo-03/after/enemy-commit.png) |
| Champion Ember Ring | [Before](evidence/wo-03/before/champion-shockwave.png) | [After](evidence/wo-03/after/champion-shockwave.png) |

The running-turn comparison uses original movie frame 12, where the normal gameplay camera exposes the boots more clearly than the rear cape view. [Reduced-motion dodge](evidence/wo-03/after/dodge-reduced.png) demonstrates restrained body motion. Actual cloud software rendering remains slow and variable; use the raw RAF measurements for this executor only. A Windows browser with hardware acceleration is still required for the owner's final feel/performance judgement. No owner approval of WO-03 is claimed.

## Verification and reproduction

- **42 Node tests pass**, including 11 new motion/NullEngine groups. They check equal-distance gait at 30/60 Hz, collision stops, bounded motion/reduced motion, sprint/turn/stop continuity, level support boots, exact authored sword contacts, immediate Cinderbolt priority, enemy telegraphs, reset and disposal. Transition regression cases cover multiple sprint phases, lateral dodges, immediate chaining and resumed movement without weakening the adjacent-frame bounds.
- **14 new animation browser groups pass** with real keyboard/mouse input: actual collision-resolved motion, sprint/turn/stop, sprint-to-dodge entry/landing, unchanged combat/dodge/cast costs and timing, pause/settings, restart, resources and disposal.
- Existing Chromium suites pass: **22 gameplay, 12 sword-feedback, 16 spell, 12 access and 10 layout groups**. These include the Warden, all three relics, champion victory using timed parries, replay and public-route denial.
- All **12 original combat/spell audio cues** pass real OfflineAudioContext rendering and cleanup checks. Existing shared-workspace checks (50 assertions), timeline/photo/history/completion regressions, authored JavaScript syntax and `git diff --check` pass.
- No new browser JavaScript/console errors or live research/API requests occurred in the gameplay, animation, sword or spell runs. Synthetic access fixtures do not claim a live signed-in contributor session.
- All 40 paired capture checkpoints match exactly for sampled player coordinates/velocity/facing, health/stamina/mana, actions, block/spell timing and enemy actions/health. Mesh/material/light/effect/projectile counts also match at every checkpoint. Rig presentation is intentionally different.

Independent review caught and corrected a sprint-to-dodge leg-pose discontinuity before delivery. The final regression tests retain their original bounds; an additional 120-entry-phase sampler measured a worst joint step below 0.289 radians per 1/60-second tick. These checks support the implementation but do not substitute for the owner's hardware playtest.

With Playwright available (use `NODE_PATH` as CI does if necessary), set `CHROME_BIN=/usr/bin/chromium` in this cloud environment or omit it to use Playwright's installed browser:

```sh
node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs scripts/test-orca-legends-audio.mjs scripts/test-orca-legends-animation.mjs
for file in game/*.js; do node --check "$file" || exit; done
node scripts/test-orca-legends-animation-browser.cjs
node scripts/test-orca-legends-browser.cjs
node scripts/test-orca-legends-feedback-browser.cjs
node scripts/test-orca-legends-spell-browser.cjs
node scripts/test-orca-legends-access-browser.cjs
node scripts/check-orca-legends-audio-browser.cjs
CAPTURE_DIR=work/wo03-review CAPTURE_LABEL=review node scripts/capture-orca-legends-animation.cjs
```

The capture harness serves `ANIMATION_CAPTURE_ROOT` when supplied, allowing a frozen baseline archive. `CAPTURE_VIDEO=0` skips movie frames; `CAPTURE_STILLS_ONLY=1` skips the separate RAF samples. Video encoding uses an installed ffmpeg; no runtime dependency is added to the game.

For owner review, check out this feature branch and use the existing local playtest launcher described in the playable documentation. Compare acceleration and stopping, running turns, sprint-to-dodge landing, attack/block/cast transitions, both enemy telegraphs and reduced motion. The launcher's inherited WO-01 name does not select the code version; the checked-out branch does. Normal contributor eligibility remains unchanged on non-demo hostnames. No public preview or deployment is part of WO-03.

## Changed files and next step

- `game/motion.js`: bounded presentation-only motion sampling/blends.
- `game/actors.js`: existing rig/boot articulation, gait/stance/transitions, enemy-only anticipation/recovery, reset and read-only diagnostics.
- `game/main.js`: post-collision movement/turn telemetry, dodge/action phase inputs, transient reset, footstep gating and test snapshots.
- New Node/Chromium animation tests and capture harness; additive checks in the existing CI test job.
- Baseline report, this handoff, playable-doc link and `docs/evidence/wo-03/`: review evidence.

Combat rules, melee/spell feedback modules, audio synthesis, loot/progression contracts, Vault/world geometry, approved artwork, authentication, Supabase, research assignments/permissions, company timelines and the live websites are unchanged. Next step is owner review and Windows playtesting of this PR. Milestone #51 remains future work; WO-03 does not introduce multiplayer or research-to-gear.
