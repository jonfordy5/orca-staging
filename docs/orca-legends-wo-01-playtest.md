# WO-01 owner playtest

PR #48 remains on `feat/wo-01-sword-combat-feel`; it is not merged or deployed to either existing ORCA website. WO-02 is not started.

## Hosted preview blocker

The managed environment's `sites-preview status` reports `preview relay unavailable: No such file or directory`. The required Sites source-packaging helpers are also absent. No separate hosted preview has been published, and no hosted URL is claimed. Existing GitHub Pages deployment targets main; deploying there would change the existing staging website and is excluded.

## Tested local alternative

With Git and Node.js installed, use a separate checkout:

```sh
git clone --branch feat/wo-01-sword-combat-feel --single-branch https://github.com/jonfordy5/orca-staging.git orca-wo01-playtest
cd orca-wo01-playtest
node scripts/serve-orca-legends-playtest.cjs
```

Open **http://orca-wo01.localhost:8000/orca-staging/orca-legends-game.html** on that same computer in Chrome or Edge. The browser resolves `.localhost` to loopback. Click **Sign in**, use your existing staging account email/password, and return to The Vault. Your existing contributor eligibility must pass before **Enter the Vault** enables. Click the game to capture the mouse. Escape releases it. Stop the server with Ctrl+C. If port 8000 is occupied, set `ORCA_PLAYTEST_PORT` to a free port.

The launcher binds only to `127.0.0.1`, disables caching, preserves `/orca-staging/` links, and excludes Git metadata, scratch files, scripts and backend directories. Do not tunnel or expose this local developer server publicly.

`orca-wo01.localhost` is deliberately outside the game's exact-host developer allowlist, so normal server-verified contributor eligibility remains enforced. Existing email/password sign-in uses the approved staging project and needs no new OAuth or email callback configuration. Sessions are scoped to this local origin; sign in again even if already signed in on the existing website. Use an existing confirmed account; new-account confirmation redirects have not been configured for this origin. No Supabase data, permissions, authentication settings or research records were changed. No credentials need to be supplied to Codex.

Automated gameplay testing uses the preexisting, visibly labeled **127.0.0.1 developer demo**. It does not grant contributor eligibility. Do not substitute that address when reviewing the normal contributor access flow. No new public bypass was introduced; public query parameters still cannot bypass access checks.

## Owner checklist

- WASD move; mouse look; Shift sprint; LMB light attack; R heavy attack.
- Compare the quick light contact with the heavy anticipation, impact and recovery. Check directional Warden reactions.
- Hold Q or RMB to block; start guarding just before a strike for **PERFECT PARRY**. Check the distinct metallic/teal feedback and brief camera nod.
- Sound starts after the Enter/click gesture. Check M mute and Escape → sound volume. Subjective sound quality requires listening by the owner.
- Space dodge, F spell, E chest interaction, I inventory/equip. Defeat the Warden, collect all three relics, enter the Coliseum and fight Varr. Restart after victory/defeat.
- Compare High and Performance quality and reduced motion in Escape settings. Reduced motion removes the camera impulse and moving blade ribbon.

## Verification and limitations

All 22 Chromium keyboard/mouse playthrough groups pass against the loopback launcher: startup, light/heavy contact, actual AI combat/parries, enemy reactions, all relics, progression, victory and restart. All 12 focused feedback groups pass for exact mechanics, quality/motion variants and cleanup. Seven real Web Audio cues render successfully; automated signal validation does not claim subjective listening. All 12 access-browser groups also pass against the actual `orca-wo01.localhost` launcher URL with synthetic Auth/RPC sessions, including sign-in/return and eligible game entry. A separate unmocked signed-out visit confirms that `?test=1&demo=1` cannot unlock that URL. No real owner's signed-in session is claimed.

Cloud Chromium uses software SwiftShader, previously approximately 2–6 FPS. This is unsuitable for judging hardware performance or final combat feel. Use a modern desktop browser with hardware acceleration on your own computer; Performance quality is available for slower GPUs. No multiplayer or persistent progression is introduced.
