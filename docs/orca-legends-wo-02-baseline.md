# WO-02 Cinderbolt baseline

Measured November 10, 2026 against merged main `8ac1bd350ae43bcd75ad3263929b7372927ec935`, before WO-02 presentation changes. A complete `git archive` of that commit was served from `work/wo02-baseline-source/`, so concurrent feature edits could not change these measurements. The approved WO-01 combat presentation is included in this baseline.

The scope is one original premium presentation for the existing Cinderbolt: readiness/charge, release, flight, collision, light pulse, afterglow and audio, with bounded high/low and reduced-motion variants. Preserve spell mechanics, controls, the three demonstration relics, the Vault, account/consent eligibility and research behavior. No production deployment, backend change or new spell system is part of this work.

## Verified behavior

- `node --test scripts/test-orca-legends.mjs scripts/test-orca-legends-access.mjs`: 25 passed, 0 failed.
- `node --test scripts/test-orca-legends-audio.mjs`: 3 passed, 0 failed.
- `CHROME_BIN=/usr/bin/chromium node scripts/test-orca-legends-browser.cjs`: all 22 browser check groups passed against the frozen source. This covers keyboard/mouse movement, sprint, camera, collision, pause, inventory/equipment, all three chests, melee, block, dodge, F spell, both encounters, starter-equipment victory through timed parries, replay, defeat, settings and signed-out public-route denial.
- No JavaScript/console errors or research/API requests occurred in the integrated suite. The spell capture also recorded no JavaScript/console errors. These local checks do not establish live signed-in entitlement.

The unchanged F input spends 28 mana, starts a 3.6-second cooldown and creates the real projectile immediately. Its existing speed is 17 units/second and lifetime is 1.6 seconds; targeting, collision, damage and stagger are the preservation baseline. The starter spell dealt 23 actual damage in these captures (Warden health 145 → 122). Mana regenerates during stepped flight, explaining the higher values in later stills. Existing WASD, Shift, mouse, left attack, R, Q/right block, Space, F, E, I, Escape and M controls remain the reference.

## Visual evidence and reproduction

Before stills and raw measurements are preserved in [`docs/evidence/wo-02/before/`](./evidence/wo-02/before/). Local full capture output, including the integrated browser log, is under `work/wo02-before/`.

The reusable [`capture-orca-legends-spell.cjs`](../scripts/capture-orca-legends-spell.cjs) serves exactly `SPELL_CAPTURE_ROOT` (the checkout by default), uses genuine Playwright `KeyF` input, and only uses the localhost test interface for scene positioning, manual time and rendering. The close camera uses `(0, 5.8)`; the flight camera uses `(0, -3)` and lets the existing Warden AI and real projectile collision determine contact. Stills are rendered at fixed 1/60-second simulation steps. Each still waits for the actual Babylon scene/materials to become ready while simulation stays frozen, then renders again. They preserve the game UI, including any transient start toast.

```sh
CHROME_BIN=/usr/bin/chromium \
SPELL_CAPTURE_ROOT="$PWD/work/wo02-baseline-source" \
CAPTURE_DIR="$PWD/work/wo02-before" \
CAPTURE_LABEL=before \
CAPTURE_REVISION=8ac1bd350ae43bcd75ad3263929b7372927ec935 \
node scripts/capture-orca-legends-spell.cjs
```

Set `CAPTURE_STILLS_ONLY=1` to skip RAF sampling. `CAPTURE_LABEL`, `CAPTURE_REVISION` and the resolved source directory are recorded in `measurements.json`; the file also contains full scene snapshots for each still and sample.

| Still | State |
|---|---|
| `charge.png` | Readiness after 0.35 seconds before F; the baseline has no hand charge or casting preparation. |
| `launch.png` | 1/60 second after F; the legacy projectile is already live, with no mechanical wind-up delay. |
| `flight.png` | 10/60 second after F; a small emissive sphere, without a dedicated trail. |
| `impact.png` | First actual damage at 32/60 second, then 3/60 second for contact presentation. |
| `afterglow.png` | 21/60 second after contact; the baseline retains the generic hit particles/damage label. |

The flight, impact and afterglow states also have `-reduced.png` counterparts using low quality and reduced motion. The old spell has no dedicated local light pulse or spell afterglow; its collision shares the existing generic hit presentation and audio. The still named `charge` documents that absence rather than claiming a baseline charging mechanic.

Additional `impact-close.png` and `afterglow-close.png` use the close camera for clearer contact review. The same real collision occurs at 5/60 second, followed by 3/60 second for impact and 21/60 second for afterglow. Before/after comparisons must use matching coordinates and file names. The final baseline stills and RAF measurements were refreshed together after adding these close views; they continue to use the untouched frozen game.

## Scene counts and software-renderer sample

| State | High meshes / materials | Low + reduced meshes / materials |
|---|---:|---:|
| Idle / readiness | 485 / 59 | 426 / 59 |
| Projectile flight | 486 / 60 | 427 / 60 |
| Collision + 0.05 seconds | 495 / 61 | 431 / 61 |

High-quality contact had 10 legacy effects; low/reduced contact had 5. These are actual complete-scene counts, not isolated spell budgets. The baseline dynamically creates one mesh/material for each bolt and disposes them at collision/expiry. The generic hit presentation also creates temporary effects.

Chromium used `--use-angle=swiftshader --enable-unsafe-swiftshader`, a 960 × 640 viewport, volume muted, one second of warmup and at least four seconds of real RAF sampling with one genuine F press near the Warden. Other test browsers were closed. The real render loop and its existing 50 ms simulation-delta cap were unchanged.

| Setting | Frames / elapsed | Mean interval | Median interval | 95th percentile |
|---|---:|---:|---:|---:|
| High, reduced motion off | 13 / 4,219.5 ms | 324.58 ms | 366.6 ms | 450.0 ms |
| Low, reduced motion on | 22 / 4,126.8 ms | 187.58 ms | 200.0 ms | 383.3 ms |

Both samples ended in `explore` with player health 100 and Warden health 122. These are short, variable measurements of software WebGL on a shared cloud executor. The rows differ in both quality and motion settings and do not isolate their costs. Repeat the same harness after the change; a hardware browser and longer matched traces are needed to assess a consumer frame-rate target or claim a performance improvement/regression.
