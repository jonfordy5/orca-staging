# WO-02 Cinderbolt review and handoff

Implements [Issue #49](https://github.com/jonfordy5/orca-staging/issues/49) on `feat/wo-02-cinderbolt-magic`, based on merged main `8ac1bd350ae43bcd75ad3263929b7372927ec935`. PR #48 was verified merged before work began; its approved game sources match the WO-01 feature head. No WO-02 merge or deployment has been performed.

## One spell, unchanged rules

Cinderbolt now gathers a warm halo, rotating sigil and orbiting ember beside the casting hand. Its ready pose leads into a palm-forward release and 0.4-second follow-through. A hot core, transparent flame tongues and tapered trail describe the fireball. One local light follows it and pulses at contact. Contact produces a pressure ring, translucent expanding shell, radial embers and a fading ground afterglow. Wall collisions and expired bolts have smaller fizzle cues. Four new original synthesized sounds distinguish gathering, launch, impact and fizzle.

The original spell launches immediately. To preserve that responsiveness and collision timing, anticipation happens **before input**: readiness gathers over 0.35 seconds as the cooldown finishes or the spell becomes available. Pressing F does not add a windup delay or action lock. Casting poses immediately yield to sword attacks, shield block, dodge, defeat and victory. Readiness is free; it never spends mana or starts cooldown. Shield-held casting remains possible as before, with shield pose taking priority.

The existing rules remain: 28 mana, 3.6-second cooldown, speed 17 units/second, lifetime 1.6 seconds, strict one-unit sampled hit radius and 23 starter damage. Auto-targeting still requires a living enemy strictly within 22 units, otherwise the original facing direction is used. Enemy contact still resolves before wall/lifetime disposal in the same tick. Explosion radius and afterglow are purely visual: no area damage or repeated hits. Frontier Star retains its existing appearance, sound, 32 damage and equipment flow.

## Budgets and accessibility

The new presentation owns a fixed pool of 37 meshes, five shared materials and one point light. Three flight slots and three contact slots reuse geometry; 16 pooled embers cover impacts. High-quality hits use 14 embers, Performance uses seven, reduced motion uses two static embers. Trails use nine samples in High and five in Performance. Reduced motion removes the moving trail, flame animation, rotating hand sigil, orbiting ember and expanding pressure ring, and attenuates body motion and local illumination.

The point light targets at most 64 existing surfaces. Range is bounded to 7 / 5.5 / 3.4 units for High / Performance / reduced motion, with reduced intensity capped at 0.65. It is disabled while idle, including when the hand is ready. No existing world light, world material or geometry is edited. The original per-cast core mesh/material and damage-number lifecycle remain; the new particle/trail/contact pool does not allocate meshes or materials per frame or hit.

Settings apply during active flight and pause. Pause freezes simulation and visual timers. Restart and scene disposal clear/detach pooled children before projectile disposal. Original audio still uses the WO-01 twelve-voice cap, shared seeded noise, live mute and node cleanup. No new dependencies, recordings, paid services or runtime CDNs were added.

## Evidence

[Baseline report and method](orca-legends-wo-02-baseline.md) · [Raw before measurements](evidence/wo-02/before/measurements.json) · [Raw after measurements](evidence/wo-02/after/measurements.json)

| Stage | Before | After |
|---|---|---|
| Ready energy | [Baseline](evidence/wo-02/before/charge.png) | [Hand charge](evidence/wo-02/after/charge.png) |
| Flight | [Baseline](evidence/wo-02/before/flight.png) | [Fireball and trail](evidence/wo-02/after/flight.png) |
| Close contact | [Baseline](evidence/wo-02/before/impact-close.png) | [Spell impact](evidence/wo-02/after/impact-close.png) |
| Close afterglow | [Baseline](evidence/wo-02/before/afterglow-close.png) | [Fading afterglow](evidence/wo-02/after/afterglow-close.png) |

[Reduced-motion contact](evidence/wo-02/after/impact-reduced.png) remains readable without the moving trail or pressure ring. Stills use actual Chromium rendering and real F input, with existing localhost-only positioning/manual-clock hooks to make comparisons reproducible. Before game sources are frozen at merged main; final after sources are recorded in the raw measurement file. The baseline has no charge/afterglow system; those labels identify the matched observation times.

## Validation

- 31 Node tests pass: existing combat/loot/access contracts and six audio lifecycle tests.
- All 22 existing gameplay browser groups pass, including real keyboard/mouse input, Warden defeat, three relics, champion victory with timed parries, replay and defeat/restart.
- All 16 new spell browser groups pass: immediate launch, exact costs/cooldown/speed/lifetime/damage, strict targeting/hit-radius boundaries, real enemy-before-wall collision ordering, no new movement/melee lock, held-input behavior, Frontier Star preservation, all four quality/motion combinations, pause/live setting switches, repeated casts, resource budgets, restart and disposal.
- All 12 WO-01 sword-feedback groups and 12 synthetic access-browser groups pass. The latter do not claim a real signed-in contributor account.
- Real Chromium OfflineAudioContext renders 12 original combat/spell cues to finite, nonzero, unclipped signals at default volume; all voices release. Six audio lifecycle tests also cover mute, bounds and mixed spell/melee bursts.
- Existing shared-research checks (50 assertions), timeline/photo/history/completion regressions and desktop/mobile layouts (10 groups) pass. Authored game/new scripts pass syntax checks, and `git diff --check` passes.
- No new browser JavaScript/console errors or live research/API requests occurred in gameplay, spell or sword runs. Capture errors are empty. Independent Babylon checks additionally sampled 34 exact WO-01 pose cases and 120 pooled spell lifecycle cycles.

Automated checks do not establish subjective audio quality, owner approval or consumer-GPU performance. The cloud browser uses software SwiftShader at roughly 2–6 FPS; brief before/after samples cannot establish a meaningful performance change. Owner playtesting with hardware acceleration on Windows remains Gate B.

Reproduce with the existing Playwright installation (`NODE_PATH` if needed). In this environment set `CHROME_BIN=/usr/bin/chromium`; omit it for Playwright's installed browser.

```sh
node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs scripts/test-orca-legends-audio.mjs
for file in game/*.js; do node --check "$file" || exit; done
node scripts/test-orca-legends-browser.cjs
node scripts/test-orca-legends-feedback-browser.cjs
node scripts/test-orca-legends-spell-browser.cjs
node scripts/test-orca-legends-access-browser.cjs
node scripts/check-orca-legends-audio-browser.cjs
CAPTURE_DIR=work/wo02-review CAPTURE_LABEL=review node scripts/capture-orca-legends-spell.cjs
```

For local owner review, check out this feature branch and run the existing `node scripts/serve-orca-legends-playtest.cjs` launcher. The contributor URL is `http://orca-wo01.localhost:8000/orca-staging/orca-legends-game.html`; its inherited hostname does not select the game's developer bypass, so normal staging sign-in and contributor eligibility apply. The inherited launcher label/hostname still says WO-01; the checked-out branch supplies WO-02. For the existing labeled developer demo, use the same path on `127.0.0.1`. Do not expose or tunnel the local developer server publicly.

F casts; WASD/mouse move and look; LMB/R attack; Q/RMB shield/parry; Space dodge; Escape quality/motion/sound settings; M mute. Compare Cinderbolt at range and close quarters, then verify swordplay, relics, both encounters and restart. No real contributor account was supplied to automated tests; access tests use synthetic transport fixtures.

## Files and next step

- `game/spell-feedback.js`: new pooled presentation and local illumination.
- `game/main.js`: successful-cast/flight/contact events, pre-input readiness, visual timers, settings/disposal and read-only test snapshots.
- `game/actors.js`, `game/audio.js`: additive Cinderbolt poses and four spell cues; WO-01 paths preserved.
- New spell browser suite and capture harness; additive audio Node/real-browser checks; existing CI test job includes spell checks.
- This handoff, baseline report, playable-doc link and `docs/evidence/wo-02/`: review evidence.

`game/combat.js`, `game/feedback.js`, `game/world.js`, loot/progression contracts, access/authentication, Supabase, research, assignments/permissions, timelines and approved artwork are unchanged. Next: owner reviews this PR and playtests Gate B before any additional spell or work order. Do not auto-merge or deploy.
