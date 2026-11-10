# ORCA LEGENDS — DEVELOPMENT WORK ORDERS
**Created:** November 10, 2026
**Source creative direction:** [Future combat, magic & multiplayer vision](./orca-legends-future-combat-magic-multiplayer-vision.md)
**Status:** Ordered backlog. One work order at a time, submitted by Codex as a reviewable pull request. The existing playable Vault is our reference baseline.

## Non-negotiable rules
- Work only in `jonfordy5/orca-staging` on a dedicated feature branch. **No production deployment or production Supabase changes.**
- Preserve existing account/consent gating, accepted research, research workspaces, company pages, timelines, user data, 3 demo relics, and game controls.
- Do not rewrite the entire game, change the established world art or add unrelated features.
- Do not copy Fable's protected art, audio, models, animations, or game assets. Use the *feel* as a reference for original work.
- Research-to-loot must be independent of BUY/SELL ratings and trading performance. Never alter existing mission findings or invent financial evidence for rewards.
- Avoid new runtime CDNs or secrets in browser code. Dispose of temporary meshes/materials/particles/sounds and avoid unbounded allocations per frame.
- Respect reduced-motion and quality settings; keep performance measurable and the fighting legible.
- **Definition of done for every work order:** passing appropriate unit and integration tests, keyboard/mouse playthrough, no new console errors, no regression in eligibility, before/after visuals or video, clear list of changed files, and one PR for review. Do not merge or deploy gameplay changes without the owner's approval.

## Work order sequence

| Order | Priority | Name | Outcome / acceptance proof | Depends on |
|---|---|---|---|---|
| WO-00 | P0 | Freeze and measure the baseline | Record current gameplay inputs, controls, browser-test coverage, representative FPS/frame time and screenshots; confirm ability to run test suite. Establish the unchanged baseline without rewriting systems. | None |
| WO-01 | P0 | Combat feel: **the first vertical slice** | Make an existing sword strike feel weighty: precise anticipation, swing and recovery; clear on-hit/parry/block/guard-break reactions; restrained camera impulse; brighter but readable contact FX; sound timing. Existing timing, stamina, hit and parry rules stay correct unless explicitly explained/tested. | WO-00 |
| WO-02 | P0 | Spellcraft: one spectacular spell | Polish an existing spell end-to-end: visible wind-up, charge, release, trail, impact, local light pulse, afterglow, distinctive audio. Adjustable FX budgets and reduced-motion variant. The existing spell remains usable with correct mana and cooldown. | WO-01 |
| WO-03 | P1 | Character animation and enemies | Upgrade pose blending/transitions for movement, dodging, melee and casting; readable enemy telegraphs and hit reactions; consistent silhouette. Use original procedural rigs/animation or properly licensed original content. | WO-01/02 |
| WO-04 | P1 | Distinctive but balanced builds | Define data-driven weapon, armor, shield, and spell cosmetic/ability variants; enforce bounded stats, interoperability and combat readability. Prototype 3 genuinely different playstyles, all viable with starter gear. | WO-03 |
| WO-05 | P1 | Verified research → persistent gear | Server-authorized, idempotent receipt of eligible research contribution, provenance-linked gear entitlement and persistence; existing consent, ownership, RLS and published findings protected. No reward based on rating. Demo fixtures remain clearly separate. | WO-04 |
| WO-06 | P1 | Two-player online combat proof | Architecture spike + playable two-player arena using server-authoritative movement, attack/hit validation, state replication and reconnection. Measure latency and avoid client-side cheat authority. No production rollout. | WO-01/03 |
| WO-07 | P2 | Ten-player Coliseum | Progress to 5v5 / FFA ten-player stress tests with concurrent spells, stable frame pacing, visual clarity, authoritative results, multiple unique builds and server load measurement. Increase to ten only after two-player success. | WO-04/05/06 |
| WO-08 | P2 | Return loop and polish | Squad/rivalry identity, meaningful rematches, match history and fair progression; onboarding/accessibility, VFX tiers, load/performance testing and fun-focused playtests. | WO-07 |

## Immediate sprint — WO-00 + WO-01
**Goal:** Improve one light sword attack and one heavy impact against the Auric Warden, demonstrating an obvious leap in tactile feedback without sacrificing the beautiful existing Vault.

### Existing source files to inspect before changing code
- `game/combat.js`: deterministic light/heavy timings, parry, block, dodge and hit arc.
- `game/main.js`: `attack()`, `meleeImpact()`, `hurtEnemy()`, `hurtPlayer()`, `updateCamera()`, `burst()`, effects lifecycle.
- `game/actors.js`: procedural rig and `update()` state animation.
- `game/audio.js`: existing synthesized combat sounds.
- `game/ui.js`: health, HUD and reduced-motion/settings interface.
- `scripts/test-orca-legends.mjs`, `scripts/test-orca-legends-browser.cjs`: regression coverage.
- `docs/orca-legends-playable.md`: runtime, controls, tests and boundaries.

### WO-01 scope and acceptance
1. First capture the actual current behavior in Chromium, including a baseline screenshot/video and a browser performance sampling. Be truthful if browser/performance measurements are unavailable.
2. Implement a **small, distinctive, original** feedback system for existing melee attacks: anticipation and follow-through; crisp contact flash/spark/trail; directional enemy flinch; heavy attack with more pronounced feedback than light; feedback for parry/block/miss. Keep effects short and readable.
3. Preserve hit detection, stamina economy, dodge invulnerability, input mapping, guardian health and victory flow. If touching deterministic mechanics, add targeted tests and explain any deliberate balance changes.
4. Camera impulse must be brief, modest and optional under reduced motion; avoid nauseating screen shaking. Avoid visual overload and avoid allocating hundreds of new Babylon meshes on each hit.
5. Update effect disposal and scene cleanup. Both high and reduced graphics variants must work.
6. Run `node --test scripts/test-orca-legends.mjs`, existing browser tests when available, `node --check` for edited JavaScript modules, and relevant research-workspace/eligibility tests.
7. Provide 2–3 stills or a short capture of light impact, heavy impact and parry. Show controls and confirm the game is still playable.
8. Deliver a PR and short handoff. **Do not auto-merge.**

### WO-01 out of scope
- Multiplayer, matchmaking, live research-to-loot, new server, new auth flow, new environments, replacing Babylon.js, commercial assets, large animation overhaul, redesigning all spells.

## Release gates
- **Gate A:** Owner confirms WO-01 combat feels better (not merely more visually busy).
- **Gate B:** Owner confirms WO-02 spell feels magical and responsive.
- **Gate C:** Two-player networking prototype is demonstrably stable before scaling to 10.
- **Gate D:** Research items unlock only from server-validated contributions with owner permissions, idempotent receipts and provenance.
- **Gate E:** Ten players can fight with distinct loadouts and multiple spells while maintaining acceptable frame pacing on the selected target hardware.

**Important:** This file is planning only; creating it does not implement, run or ship any game change.
