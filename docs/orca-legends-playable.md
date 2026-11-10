# ORCA Legends — The Vault playable prototype

The game lives on the independent `orca-legends-game.html` route. The existing research pages, stock timelines, authentication, approved world artwork, old Coliseum, and research database are unchanged.

## Contributor access

The remote approved design documents were updated during development to lock **personal-agent research contribution as the prerequisite for regular gameplay**. This prototype follows that updated baseline: visiting the public staging route does not grant ordinary play. Participants sign in through the existing ORCA account flow, authorize their own personal assistant, and complete an accepted, source-backed research mission through the existing claim / brief packet / independent research / publish workflow. ORCA coordinates assignments; the participant's agent performs the research.

The independent game's eligibility check reads the signed-in owner's opted-in agent profile, a completed `research_tasks` row assigned to that agent, and a matching published `commons_research_findings` row with its ORCA publication marker and an HTTPS source reference. It does not write research rows, grant new research permissions, or treat an unrelated public finding as the participant's contribution. This is a read-only check against the existing workflow, not a new server-side entitlement system or independent verification of financial truth.

A visibly labeled **local development demo** bypasses contributor membership only on exact loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`, or `::1`). Adding `?test=1` or `?demo=1` to a public URL does not bypass the contributor gate. For development review, run the local server described below. The public staging experience requires contributor eligibility and an existing signed-in session.

The interface does not claim that a personal agent is currently connected or researching. A completed contribution establishes participation eligibility; it does not establish an active agent session. Additional research requires a separate active, owner-authorized session. Opening the game, opening chests, or closing ChatGPT never launches a platform AI companion or continues a disconnected user's research.

## Run and deploy

Serve the repository as static files, for example `python3 -m http.server 8000`, then open `http://localhost:8000/orca-legends-game.html` for the marked developer demo. A modern desktop browser with WebGL and keyboard/mouse is required. This is a GitHub Pages compatible application: no bundler, paid research service, or server runtime is needed. Babylon.js is served locally from `game/vendor/` rather than a runtime CDN. Public participation uses the existing ORCA authentication configuration and read-only contribution eligibility check.

Run data-contract and preservation checks with:

```sh
node --test scripts/test-orca-legends.mjs
```

This static application has no npm build step. Check JavaScript syntax with:

```sh
for file in game/*.js; do node --check "$file" || exit; done
```

Browser gameplay checks and their observed results are recorded separately after the integrated build is exercised. Passing data tests alone is not evidence that combat or rendering works.

## Controls

| Input | Action |
|---|---|
| WASD | Move relative to camera |
| Shift | Sprint, using stamina |
| Mouse | Camera (click the game to capture, or drag where supported) |
| Left mouse | Light sword attack |
| R | Heavy sword attack |
| Right mouse / Q | Hold shield block |
| Space | Dodge |
| F | Cast equipped spell |
| E | Interact with nearby chest or gate |
| I | Inventory, item comparison, research details, equip |
| Escape | Pause / release mouse |
| M | Mute |

## Demonstration research and balance

All bundled research-to-loot rows are **DEMONSTRATION fixtures**. They are training prompts, not original or verified claims about NVIDIA. The SEC EDGAR citation gives players an original-source starting point for investigation; linking a filing does not verify the fictional item. Attribution explicitly identifies the prototype authors and does not claim another researcher's discovery. No research runs when a chest opens, and nothing writes to ORCA's research systems.

| Chest | Realm / area | Guaranteed item | Slot | Demo rarity | Game statistic |
|---|---|---|---|---|---|
| Management | The King's Keep / Management | Steward's Aegis | Shield | Rare | 65% frontal block reduction |
| Earnings | The Vault / Earnings | Dawn of the Ledger | Weapon | Legendary | 23 base damage |
| Positioning | The Frontier / Positioning | Frontier Star | Spell | Epic | 32 spell damage |

The starter sword does 17 base damage, starter shield blocks 45%, and starter spell does 23 damage. The five supported rarity tiers are Common → Uncommon → Rare → Epic → Legendary. The table is deterministic and authored for the demonstration; financial ratios, returns, bullishness, time played, and money spent do not determine rarity. Equipment gains are bounded so timing, dodging, blocking, positioning and attack recovery can decide the outcome.

## Future research boundary

`game/loot.js` keeps equipment, source attribution, verification and balance together in a validated transport contract. Every item contains an ID, name, slot/category, rarity, realm/area, ticker, summary, source ID/link, attribution, appearance, ability, damage/defense/spell statistics, and verification state. Inventory additions are idempotent by item ID.

`createDemoResearchProvider()` supplies only bundled demonstration fixtures. A separate `createVerifiedCacheProvider(loadCachedFindings)` accepts a caller-supplied read-only cache loader, filters out demonstration/unverified rows, requires a finding ID and verification date, and deduplicates finding IDs. This validates the data shape, not financial truth. A future trusted service must establish evidence authenticity, permissions, attribution, novelty, and explicit research authorization before supplying cached rows. The loot adapter itself does not connect to a backend, schedule workers, or spend money. Do not trust browser-provided verification flags as proof of evidence. The separate contributor access module reads existing participation evidence; it does not populate the demonstration loot table from live research or claim to implement live finding-to-loot notifications.

## Asset provenance and licenses

- **Babylon.js 8.38.0:** locally vendored upstream npm distribution at `game/vendor/babylon.js`, Apache License 2.0; see `game/vendor/BABYLON-LICENSE.md`.
- **Dungeon architecture, props, materials, textures, characters, equipment, and animation:** original procedural art and code authored for this prototype. No ripped game assets or third-party character models are used.
- **Sound:** synthesized in the browser for this prototype where enabled; no sampled music or third-party audio.
- **Approved ORCA realm images:** existing owner-approved repository assets, preserved byte for byte. `assets/orca-world-earnings.webp` is used as an uncropped atmosphere reference on the independent title screen. This change does not grant new rights or alter existing provenance.

## Scope and limitations

This is a compact browser action-RPG prototype, not a finished AAA game. Multiplayer, live agents, live financial research, persistent progression, guilds, crafting, mobile controls, and production research integration are outside this slice. The research cache seam is an integration contract, not a claim of a connected backend. Browser performance varies by GPU; use the available quality setting for slower systems. Save/reload persistence and accessibility for players unable to use a keyboard/mouse require a later pass.

## Validation of this slice

- All 17 Node tests pass for loot, equipment, combat rules, contributor eligibility, malformed evidence, and locked research-card preservation.
- All 22 integrated Chromium browser check groups pass: real WebGL startup, keyboard movement/sprint, mouse camera, walls/pillars/gate, pause, all chests and lid animation, visible equipment material changes, original-source links, light/heavy attacks, blocking, dodge invulnerability, projectile/mana, guardian defeat, arena entrance, champion attacks, common-equipment victory using timed parries, victory replay, defeat/restart, and settings. The public signed-out route remains locked even with `?test=1`.
- The browser harness uses localhost-only development eligibility and test-only positioning/manual simulation time for deterministic traversal and combat. Rendering was actually exercised and screenshots inspected; these checks are not a performance benchmark on consumer hardware.
- No browser JavaScript/console errors or live research/API requests occurred in the local gameplay run. Source links remained available; the SEC EDGAR link returned HTTP 200.
- Existing shared-workspace checks (50 assertions), timeline research/photo regressions, and actual desktop/mobile timeline layout tests pass.
- All authored game modules pass `node --check`. This buildless static route has no bundling step.
- Read-only staging schema probes succeeded for research task/finding fields. Anonymous profile access is correctly denied. A real signed-in contributor session was unavailable for end-to-end entitlement testing; no permissions or research rows were changed.

To rerun the browser suite, provide Playwright through `NODE_PATH` as the existing CI workflow does, then run `node scripts/test-orca-legends-browser.cjs`. `CHROME_BIN=/usr/bin/chromium` selects an installed Chromium; omit it to use Playwright's downloaded browser. The existing Pages deployment workflow now runs both the game and prior research regressions before deploying.

The contributor gate is a staging client flow based on server-returned existing records. Static GitHub Pages source is downloadable; tamper-resistant competitive entitlements require a future server-authorized game service. The arena reward is a demonstration victory screen, not a persistent account reward. Art is original stylized procedural geometry rather than production character/environment assets. Live research-to-loot events, persistent saves and multiplayer remain unimplemented.

Additional vendored dependency: **Supabase JS 2.49.8**, MIT license, `game/vendor/supabase.js` and `game/vendor/SUPABASE-LICENSE.txt`. It is used only for the existing public-route account/contribution check. It does not run research or alter backend permissions.

## Exact files in this change

Created:

- `orca-legends-game.html`
- `game/access.js`
- `game/actors.js`
- `game/audio.js`
- `game/combat.js`
- `game/game.css`
- `game/loot.js`
- `game/main.js`
- `game/ui.js`
- `game/world.js`
- `game/vendor/babylon.js`
- `game/vendor/BABYLON-LICENSE.md`
- `game/vendor/supabase.js`
- `game/vendor/SUPABASE-LICENSE.txt`
- `scripts/test-orca-legends.mjs`
- `scripts/test-orca-legends-browser.cjs`
- `docs/orca-legends-playable.md`

Changed:

- `.github/workflows/orca-workspace-consistency.yml` — adds game syntax, contract, and browser checks ahead of the existing staging Pages deployment.

The two newly updated locked master documents were fast-forwarded from the owner's remote main branch. This game change does not edit them.
