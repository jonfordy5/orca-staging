# The World of ORCA — Locked Master Design Template
**Status:** APPROVED CREATIVE BASELINE • 2026-11-09  
**Owner vision:** "ORCA: Where Your AI Becomes a Legend." / "Knowledge Is Power."  
**Relationship to other specs:** Read alongside [the full Research-to-Loot RPG specification](./orca-legends-research-to-loot-rpg.md). This locked baseline reflects later approved UI changes and takes priority for the three research-realm cards.

> **Developer instruction:** Preserve these choices across refactors, experiments, Codex/Work sessions, or game prototypes. Do not rename, remove, rearrange, recolor into a different brand, crop, or replace approved assets without explicit owner approval. Propose alternatives in an independent prototype, not over the approved page. Any approved changes should be documented in the Change Log.

## 1. The canon: three realms, three research disciplines
| Realm name — exact text | ORCA research area | Visual identity | Permanent currently approved image |
|---|---|---|---|
| **The King's Keep** | **Management** | Moody ancient Gothic throne room, dark stone, candles, dramatic arched ceiling | `assets/orca-world-management.webp` |
| **The Vault** | **Earnings** | Warm gold treasury, open glowing chest, jewels and coins, strong rays of sunlight | `assets/orca-world-earnings.webp` |
| **The Frontier** | **Positioning** | Misty blue frontier fortress, timber palisade/watchtowers, cloudy twilight, purple flowers | `assets/orca-world-positioning.webp` |

These are the three permanent ORCA research categories, not generic decorative themes. A stock (NVDA, TSLA, etc.) is an expedition. Don't replace the research areas or relabel The Frontier as "Investors."

## 2. Approved stock-page implementation — do not regress
**Source:** `research-workspace.html` uses **one shared page** for all ticker research workspaces, including staging. The authoritative research cards are within `#collective-research-dashboard #investor-question-board`.

- Integrate the three realm images **at the top of the existing Management, Earnings and Positioning cards**, not in a separate "World of ORCA" row.
- Display the **entire original portrait**, **no cutting off the bottom**: portrait `aspect-ratio:3/4`; image `object-fit:contain`, not `cover`. Keep the full uncropped source files. Responsive/mobile sizing is allowed without changing proportions.
- Place **realm title and research category inside each image, near the bottom**, using a legible dark gradient and white typography. There must be **no redundant name/category block below the image**; the saved vertical space belongs to research.
- Keep the source-backed findings **directly below their respective images**. Maintain the existing research-card IDs: `investor-answer-execution`, `investor-answer-pricing`, `investor-answer-positioning`.
- Do not duplicate these cards, replace real research with fictional items, alter assignments, remap research results, or affect the historical company timeline.
- Current files under `assets/` are the approved uploaded visual reference images. Preserve their origin and provenance; do not silently swap in third-party stock previews or new generative substitutes.
- An automated shared-workspace consistency test should catch missing names, missing assets, separated cards, removed overlays, or an accidental separate preview row.

## 3. Gameplay identity — locked direction, NOT yet implemented
The ultimate goal is a **polished, genuinely playable 3D action RPG**, drawing from Diablo/Darkstone-style dungeon exploration and loot, with tactile swordplay, dodging, blocking, stamina, spells and timing reminiscent of classic RPG combat. A static web debate with robotic costumes is **not** the final experience.

1. **Human controls the hero** in a 3D stock-themed expedition. The **opted-in AI researcher** is the research companion/treasure hunter.
2. **Research contribution unlocks play**. After the participant's own agent completes an accepted source-backed ORCA mission, cached verified evidence can power immediate loot and quests without extra AI calls.
3. New owner-authorized, dated, original-source research may create a **new chest, item, relic, spell, or quest**, once checked for authenticity, relevance, source and duplication. Research depth leads to distinct discovery types—not automatic gains just from idle time.
4. **Common / Uncommon / Rare / Epic / Legendary** tiers reflect source strength, usefulness, original contribution and independent scrutiny, **not simply bullishness, a margin percentage or hype**.
5. **Research Forge:** complementary Management, Earnings and Positioning discoveries can be combined into weapons/armor/spells. Attribution remains visible and inspectable.
6. **Research guilds** let differently skilled agents contribute complementary evidence. Proposed classes: Rogue/Filings Hunter, Mage/Macro Seer, Knight/Financial Guardian.
7. **Underdog gameplay matters:** even an under-equipped newcomer with skill and a meaningful new verified discovery can defeat a better-equipped champion. Tactile player combat skill must matter; research doesn't automatically decide the winner.
8. Rivalries, seasons, hero identities, challenges, fans, replayability and match highlights are the entertainment layer. Published real research and game mechanics must remain distinguishable.

### Agent-research participation and assignment model — OWNER-APPROVED CORE RULE
**ORCA Legends is a contributor game, not an open-to-all game.** A person participates by bringing and authorizing **their own AI assistant**, claiming an ORCA research metric, and completing a legitimate source-backed research mission. The game is the incentive for building the independent Commons research database. ORCA must **not** supply a default platform-operated AI companion, substitute an OpenAI API bot for the member's assistant, or grant normal gameplay participation merely for visiting the site. Public Commons reading and spectator experiences (if offered) are separate from contributor-gated gameplay.

**Role split:** ORCA is the **dispatcher, assignment allocator, brief-packet provider, mission/status ledger, and verifier**. Participating personal assistants are the **actual researchers**. Humans are the **game players**. The existing claim / independent research / publish workflow remains authoritative.

1. Participant signs in, explicitly authorizes their own assistant, and selects or receives an existing ORCA mission. Their **first completed and accepted research mission** unlocks regular gameplay. A purely local developer demo may bypass this gate only if visibly marked as a test.
2. ORCA assigns an available **distinct, well-scoped metric/question** and provides a concise evidence/brief packet that avoids repeating prior work; packet is for orientation, not instructions to accept previous conclusions.
3. The owner's active agent researches independently, checks credible dated primary sources, and publishes source-backed findings and uncertainties through the approved assignment. An agent may research while the owner plays **only if its authorized ChatGPT Work/research session actually remains active**. The game does not summon a closed or disconnected personal ChatGPT agent on demand.
4. The player continues playing in the separate game interface. On publication/acceptance, ORCA updates Supabase; the game receives (polling or Realtime) a **new discovery event** and converts approved research into collectible equipment. Attribution and source inspection are preserved.
5. ORCA may precreate or allocate the **next assignment** when a previous task is completed, but the owner's agent must be active and authorized before investigating it. No background agent impersonation or unlimited auto-claiming.
6. As player numbers increase (e.g., 500 concurrent participants), ORCA allocates **different research tasks or deliberately scoped independent verification** across Management, Earnings and Positioning: more companies, new filings/time periods, distinct subquestions, cross-company evidence, unresolved contradictions, and freshness checks. Existing fixed metric catalog requires **future subdivision/question scheduling** to scale; do not claim today's six metrics guarantee 500 nonoverlapping missions.
7. Reward **accepted original contributions and useful verification**, not sheer time, excessive token use, repetitive claims, the direction of a stock opinion, or clicking the same mission repeatedly. A valid result that confirms prior evidence is useful; a duplicate earns no imaginary new discovery.
8. Reuse cached verified findings for dungeon population **after player access is earned**; cache does not exempt a newcomer from performing their own research contribution.

**No default ORCA API research companion and no platform-paid autonomous-research substitute.** Any future server AI capability would be a separately approved architectural change, not an assumed feature of this game. Existing research permissions, privacy and owner control remain unchanged. ORCA coordination logic (allocation, briefs, verification, notifications) can run server-side without autonomous OpenAI searches.

- No trades, real-money gambling, pay-to-win, mandatory subscriptions or unapproved account integrations. Contributing/play is free but **requires genuine agent research**. Advertising is separate from published findings.

## 4. First prototype acceptance criteria
- One polished, compact 3D dungeon, responsive character control, convincing block/dodge/attack, one guardian, one arena encounter.
- Three research-linked chests or discoveries, one for each research realm, with inventory/equip and accessible evidence details.
- A contributor-gated entry flow (connecting one's own agent and completing an accepted metric mission) is required for regular gameplay; prototype demo access is explicitly labeled. Existing verified Commons evidence supplies loot without platform-operated AI research.
- An owner-approved new contribution can later add one legitimate unique discovery item, without forcing a ChatGPT agent to run in the background.
- Staging/prototype only until expressly approved; keep the existing site, timelines and research data intact.

## 5. Explicit change-control rule
**LOCKED:** The three names, their mapping, original visuals, full-image aspect ratio, text-over-image treatment, integration inside existing research cards, research IDs, the contributor-gated personal-agent research/ORCA-dispatch model, and the ambition of a real 3D research-to-loot RPG.  
**FLEXIBLE:** Specific animations, character visuals, weapon balance, 3D engine, individual mission scenarios and game UI details during prototyping.

When an improvement is proposed:
1. Compare against this baseline and the detailed RPG spec.
2. Mock up the proposed change separately.
3. Get explicit owner approval before changing a locked element.
4. Record approval, date, rationale and affected files here.

## Change log
| Date | Change | Status |
|---|---|---|
|---|---|
| 2026-11-09 | Clarified that contributing real research with the player's own authorized AI is the required participation gate; ORCA allocates varied tasks and packets, never substitutes a default API researcher. | Locked |
| 2026-11-09 | Three world identities approved and illustrated. | Locked |
| 2026-11-09 | Artwork merged into three existing research cards; separate preview row removed. | Locked |
| 2026-11-09 | Full uncropped portrait artwork with names and category labels **inside** the images. | Locked |
| 2026-11-09 | Research-to-Loot 3D RPG direction, independent human/AI roles and cache-first architecture documented. | Vision locked, build pending |
