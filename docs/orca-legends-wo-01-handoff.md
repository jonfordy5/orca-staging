# WO-01 sword combat review and handoff

Implements [work order #47](https://github.com/jonfordy5/orca-staging/issues/47), WO-00 baseline plus WO-01 only. Feature branch: `feat/wo-01-sword-combat-feel`. The next step is the owner's keyboard/mouse playtest and Gate A review of combat feel. WO-02 and later work orders have not started.

## Result

Light attacks sweep quickly into contact; heavy attacks hold an overhead anticipation, cut into the original damage tick, then follow through and recover. Both use the original procedural fighter geometry. Enemy telegraphs now use their actual windup/contact ratio, and movement and shield poses blend into combat. Directional recoil moves only the visual rig: it cannot push collision coordinates, change facing, manufacture a stagger, or cancel a committed windup.

Sword contact now produces a short armor glint and sparks. A narrow blade ribbon follows only the active cut, including misses; misses produce no contact flash, damage, or camera impulse. Held blocks, timed parries, and exhausted guards have separate original synthesized cues and contact colors. Shield contacts emit at the outer rim, where the following camera can see them. Heavy hits and parries add one brief, damped camera nod; light hits do not shake the camera. Audio release cues begin during the cut rather than at button press; impact sounds occur on contact.

No balance changes: light remains 14 stamina / .22-second contact / .56-second duration / 17 starter damage; heavy remains 28 / .48 / .94 / 28 rounded starter damage. Hit arcs, reach, dodge invulnerability, block mitigation, six-stamina timed parries, enemy health, progression, equipment, and input mapping are preserved. As before, a heavy hit bypasses an enemy's guard and staggers it; it does not grant a new persistent guard removal rule.

## Motion and resources

The feedback pool owns 16 sparks, three contact glints and one ribbon, plus five shared materials, allocated once per scene. A normal/high contact uses seven sparks, a strong contact 12; Performance quality uses three/five. Reduced motion uses two short sparks and a smaller contact glint, disables the ribbon and camera impulse, and attenuates visual recoil. Quality and motion settings work independently. All pooled objects clear on restart and dispose with the scene. Existing damage numbers and non-melee effects retain their previous lifecycle.

Web Audio uses one seeded noise buffer, at most 12 concurrent cue voices, live master mute and explicit node cleanup. No downloaded recordings, new runtime dependencies, textures, lights, services or paid APIs were added.

## Review evidence

These are actual 960 × 640 Chromium screenshots, using the same local scene, starter equipment and manual-clock combat actions. They preserve the HUD and control hints. Baseline captures use commit `73a3ad5677eeece31834f33f0ca45ded7febe1f1`; after stills include the final shield-rim correction at `ca37df3`. The parry still uses the existing test contact hook after a real Q guard input; the integrated playthrough separately verifies timed parries against actual AI attacks.

| Contact | Before | After |
|---|---|---|
| Light | [Baseline](evidence/wo-01/before/light-impact.png) | [Improved light](evidence/wo-01/after/light-impact.png) |
| Heavy | [Baseline](evidence/wo-01/before/heavy-impact.png) | [Improved heavy](evidence/wo-01/after/heavy-impact.png) |
| Parry | [Baseline](evidence/wo-01/before/parry.png) | [Improved parry](evidence/wo-01/after/parry.png) |

See [baseline and comparative measurements](orca-legends-wo-01-baseline.md) and raw [before](evidence/wo-01/before/measurements.json) / [after](evidence/wo-01/after/measurements.json) data. Software SwiftShader ran at roughly 2–6 FPS before and after. These brief cloud samples cannot establish consumer GPU performance or a statistically meaningful speed change. Actual feel, loudness and frame pacing still need a hardware browser and owner playtest; no subjective audio listening or owner approval is claimed.

## Validation

- 28 Node tests passed: existing combat/loot/eligibility contracts plus three new audio lifecycle checks.
- All authored game modules and new scripts pass JavaScript syntax checks; `git diff --check` passes.
- Existing integrated Chromium gameplay suite: all 22 groups pass, including Warden defeat, all relics, starter-equipment champion victory using timed parries, dodge, spells, defeat/restart and public-route denial.
- New feedback Chromium suite: all 12 groups pass, including exact contact-frame damage and costs, recovery, misses, directional recoil without collision movement, guarded attacks, parry and guard break, live rendering of enabled effects, all four quality/motion combinations, overlapping-contact pool stability across restarts, and complete page disposal.
- Access-browser suite: all 12 groups pass using the real SDK with synthetic Auth/RPC responses. This does not claim a real signed-in contributor session or live backend verification.
- Real Chromium OfflineAudioContext renders all seven combat cues to finite, nonzero, unclipped signals at the default .35 volume. Heavy-hit RMS is stronger than light; all voices release naturally. Subjective listening remains an owner check.
- Existing shared-workspace checks (50 assertions), timeline/photo/history/completion regressions and desktop/mobile layout suite pass. No research application source was changed.
- No new JavaScript/console errors or live research/API requests occurred during local gameplay and feedback runs. Access transport fixtures are isolated from live services.

## Reproduce

There is no application build or npm installation step. Use an available Playwright installation via `NODE_PATH` if needed, as CI already does. Set `CHROME_BIN=/usr/bin/chromium` for this cloud environment, or omit it to use Playwright's installed browser.

```sh
node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs scripts/test-orca-legends-audio.mjs
for file in game/*.js; do node --check "$file" || exit; done
node scripts/test-orca-legends-browser.cjs
node scripts/test-orca-legends-feedback-browser.cjs
node scripts/test-orca-legends-access-browser.cjs
node scripts/check-orca-legends-audio-browser.cjs
CAPTURE_DIR=work/wo-01-review node scripts/capture-orca-legends-combat.cjs
```

The capture script saves three contact stills and raw RAF samples under `work/` by default. `CAPTURE_STILLS_ONLY=1` skips measurements. For a frozen baseline, archive the baseline's `game/` files outside the working tree and set `CAPTURE_SOURCE_ROOT` to that directory; the harness overlays those modules while serving unchanged assets from this repository.

For owner playtesting, run `python3 -m http.server 8000` and open `http://localhost:8000/orca-legends-game.html`. This is the explicitly marked local developer demo. LMB light, R heavy, Q/RMB shield, Space dodge, F spell, WASD move, Shift sprint, I inventory, Escape settings. Check light/heavy contrast and parry timing both with headphones and reduced motion before accepting Gate A.

## Changed files and boundaries

- `game/actors.js`: procedural poses, transitions, allocation-free armor tint and visual recoil.
- `game/audio.js`: original layered synthesis, bounded voices and mute/cleanup.
- `game/feedback.js`: pooled contact/ribbon feedback and bounded camera envelope.
- `game/main.js`: presentation events, release audio timing, reactions, settings/cleanup integration and read-only test diagnostics.
- `scripts/test-orca-legends-audio.mjs`, `scripts/test-orca-legends-feedback-browser.cjs`, `scripts/check-orca-legends-audio-browser.cjs`, `scripts/capture-orca-legends-combat.cjs`: focused verification and reproducible review capture.
- `.github/workflows/orca-workspace-consistency.yml`: adds the focused checks to the existing test job; its production deployment condition is unchanged.
- This handoff, the baseline report, playable-doc link and `docs/evidence/wo-01/`: review records.

`game/combat.js`, world geometry/art, contributor access, loot/progression contracts, Supabase, research assignments/permissions, timelines and website source are unchanged. The feature branch is for review; nothing has been merged or deployed. After Gate A, use the ordered work orders to scope WO-02 separately.
