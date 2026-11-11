# ORCA R6 — The Guild Hall: Codex implementation handoff

Act as senior full-stack engineer, visual designer, accessibility specialist and cautious database integrator. Work inside the existing repository **jonfordy5/orca-staging**. This brief captures owner-approved intent as of Nov 11, 2026.

## Mission
Build **The Guild Hall**, a personal ORCA research headquarters with the cinematic dark navy, charcoal, antique-gold and subtle teal ORCA Commons visual system. The uploaded reference images in the owner's ChatGPT thread are: (1) warm medieval strategy room with a parchment map table; (2) stained-glass gothic intelligence chamber with a great map; (3) blue-and-gold celestial map hall. These define atmosphere, depth, lighting and scale. Do NOT copy unlabeled third-party imagery from the internet or claim image rights you cannot verify. The first implementation may reuse original approved in-repo world art; import the owner's three reference pictures as optimized web images only when their actual source files are available to the GitHub workspace and their usage is authorized. Never invent URLs or display broken cards.

**One principle: research first; ORCA Legends game/multiplayer paused.** Preserve the existing game prototype and previously built gameplay without touching it.

## Existing R6 implementation branch
`feat/orca-r6-guild-hall` implements:
- `guild-hall.html` with shared nav, original approved imagery, personal research home, mission chamber, credentials, publication record and simple achievements.
- `orca-guild-hall.css` scoped responsive styling. Do not redo the chart/timeline.
- `orca-guild-hall.js` with **read-only, authenticated, owner-filtered** Supabase queries and two existing owner-bound RPCs. Do not trigger claim, publication, member join, consent, signout or paid AI generation on a passive Guild Hall page view.
- Main-site `Guild Hall` links and `account.html?returnTo=guild-hall.html` sign-in continuation, preserving other returnTo routes.
- `scripts/test-orca-guild-hall-browser.cjs` and unchanged R1–R5/page/game CI.

## Exact data contract (verified against staging Postgres metadata)
- Auth: `sb.auth.getUser()` to verify current owner; signed-out shows only a sign-in gate, no private queries.
- Owner profile: `agent_profiles` filtered `owner_id=user.id`; fields `id,display_name,opted_in,independent_publish_enabled`. Profile name is distinct from each public stock-team alias.
- Owner membership: `stock_research_memberships` filtered `user_id=user.id`; fields `ticker,display_name,joined_at`. Explicitly report unavailable vs no membership.
- Owner publications: `commons_research_findings` filtered `contributor_id=user.id`; exact count, limited recent records. Existing `commons_publish_finding` stores `contributor_id=auth.uid()`. Never count records by matching a public alias.
- Owner current mission: `commons_my_claim({p_ticker:ticker})` returns only a still-active task claimed by that owner, including id, metric, question and lease deadline; `orca_my_assigned_board({p_task_id:id})` confirms server-assigned `board_key`. Show lore realm alias only **after checking the actual board key**, never infer realm from the metric. No assignment? State that no current mission was found and route to existing research workspace.
- Agent connection: from `agent_sessions` filtered by validated owner profile ID plus status/expiry. Profile/permission ON does NOT establish a live ChatGPT Work connection. Do not expose session tokens or owner UUIDs.
- `orcaStagingHref` preserves links and environment. Existing Work handoff remains `connect-work.html` with user-initiated prompt copying/launch. Page does not launch Work or let unsanctioned assistants claim tasks.

## Visual requirements
Cinematic page top: welcoming strategy-hall hero; clear caption; no stock-game gambling language. Main left: genuine mission card with research metric title and original label, exact server-assigned realm, date and research question, honest empty state, actions to open workspace and prepare Work mission. Right: researcher alias/profile, ON/OFF permissions, actual connected lease status and quick links. Below: owner-backed published findings with ticker, metric and publish date; modest progress summary with only real count and team count. Accessible 1440px, 393px and 320px; keyboard, responsive layout, reduced motion, sufficient contrast and safe textContent for all untrusted source values. If imagery is unavailable, use existing licensed in-repo pictures or clearly labeled illustrated fallback; never blank cards.

**No fictional levels, streaks, PvP ranks, loot, contribution score or agent activity.** Those require a separately specified, auditable schema and approved policy. No scope creep into game or Supabase migrations.

## Security, cost and acceptance
- No secret/service-role key in JS. No privileged direct SQL in client. RLS and existing auth/RPC contract remain authoritative.
- No new Supabase tables or DDL, no RLS changes, no new third-party resources and no paid image/AI calls.
- Review the old research table `TRUNCATE` grants separately before public expansion; do not paper over this by hiding links.
- CI must prove signed-out zero private queries, signed-in owner filters, real assigned-board RPC, exact owner publication count, no writes, missing-data safety and mobile viewport geometry. Retain all earlier workspace, R1–R5, Legends and publication tests.
- Check the live staging Guild Hall with real authorized owner account **only after merge**, without ever asking the user for passwords, codes or tokens in chat. Never invent screenshots or claim authenticated verification from a mocked browser.
- Release to staging via a scoped PR after all GitHub tests pass; production unaffected. Owner judges rendered site, not raw diff.

## Future
Once the Hall works and source assets are accessible, replace the first-pass placeholder realm panels with the approved user-provided 3 atmospheric room images, optimized as WebP with source information retained. Then run a separate backend security/assignment mapping audit before inviting outside researchers. Legends progression remains a separate future phase.
