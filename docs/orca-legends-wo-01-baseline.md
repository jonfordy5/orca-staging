# WO-00 / WO-01 baseline

Measured before gameplay edits on commit `73a3ad5677eeece31834f33f0ca45ded7febe1f1`, November 10, 2026. Scope: the existing local-development Vault, Auric Warden, and Coliseum. This session implements only WO-01; world art, research, account eligibility, progression, and production remain outside the change.

## Baseline verification

- `node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs`: 25 passed, 0 failed.
- `CHROME_BIN=/usr/bin/chromium node scripts/test-orca-legends-browser.cjs`: all 22 browser check groups passed. The suite exercises real WebGL; WASD/sprint, camera, collision, pause, three chests, inventory/equipment, light/heavy attacks, block, dodge, spell, Warden defeat, arena unlock, Varr's telegraphs, starter-equipment victory using timed parries, replay, defeat/restart, settings, and public-route signed-out denial.
- No browser JavaScript/console errors or research/API requests occurred during that run. Public `?test=1` stayed locked. This does not establish signed-in entitlement against a live account or change the backend.
- Before images and raw logs/measurements were captured locally under `work/wo-01-baseline/`; the delivery handoff identifies preserved review evidence.

Controls remain: WASD move, Shift sprint, mouse orbit/capture, left mouse light attack, R heavy, right mouse/Q block, Space dodge, F spell, E interact, I inventory, Escape pause/release, M mute. The existing browser suite exercises keyboard and mouse input in addition to localhost-only positioning/manual-time hooks.

## Browser performance sample

Chromium ran headlessly with `--use-angle=swiftshader --enable-unsafe-swiftshader`: **software WebGL**, 960 × 640 viewport. After one second of warmup, an unchanged real-time render loop was sampled through `requestAnimationFrame` for at least four seconds, with light/heavy inputs scheduled near the Warden. Each setting used a fresh page, with volume muted. These are diagnostic measurements of this shared cloud executor, not a consumer GPU benchmark or frame-rate target.

| Setting | RAF frames / elapsed | Mean interval | Median interval | 95th percentile |
|---|---:|---:|---:|---:|
| High, reduced motion off | 12 / 4,797.1 ms | 399.76 ms | 400.0 ms | 1,233.4 ms |
| Performance, reduced motion on | 25 / 4,090.1 ms | 163.60 ms | 166.6 ms | 300.0 ms |

Both runs stayed playable (`explore`, player health 100, Warden health 117), with zero captured browser errors. At this low software frame rate, the existing 50 ms simulation-delta cap means only one heavy impact completed during each wall-clock sample. Samples are short and variable; the high and low rows also differ in reduced-motion setting, so they do not isolate the cost of graphics quality. Repeat the same harness and conditions after changes; do not infer a hardware performance improvement from these values.

## Observed feedback gaps

The mechanics already provide separate light/heavy impact times, stamina costs, recovery, stagger, hit arcs, frontal defense, timed parries, and dodge invulnerability. These rules are the preservation baseline.

Presentation currently uses one generic swing sound at attack start and generic hit/block tones; its animation phases use fixed fractions rather than the existing damage-contact time. Enemy contact mainly flashes armor red, and parry shares the ordinary block sound. There is no brief directional melee flinch or bounded impact camera impulse. Per-hit sphere bursts last 650 ms, while no sword-attached motion trail describes the active cut. WO-01 should improve that timing and clarity with short, bounded feedback rather than extending the feature scope or increasing visual clutter.
