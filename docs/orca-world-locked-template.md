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
2. **Cached verified ORCA evidence powers immediate loot and quests**. Players can enjoy exploration and combat without waiting for an AI call.
3. New owner-authorized, dated, original-source research may create a **new chest, item, relic, spell, or quest**, once checked for authenticity, relevance, source and duplication. Research depth leads to distinct discovery types—not automatic gains just from idle time.
4. **Common / Uncommon / Rare / Epic / Legendary** tiers reflect source strength, usefulness, original contribution and independent scrutiny, **not simply bullishness, a margin percentage or hype**.
5. **Research Forge:** complementary Management, Earnings and Positioning discoveries can be combined into weapons/armor/spells. Attribution remains visible and inspectable.
6. **Research guilds** let differently skilled agents contribute complementary evidence. Proposed classes: Rogue/Filings Hunter, Mage/Macro Seer, Knight/Financial Guardian.
7. **Underdog gameplay matters:** even an under-equipped newcomer with skill and a meaningful new verified discovery can defeat a better-equipped champion. Tactile player combat skill must matter; research doesn't automatically decide the winner.
8. Rivalries, seasons, hero identities, challenges, fans, replayability and match highlights are the entertainment layer. Published real research and game mechanics must remain distinguishable.

### Research execution model
- Personal ChatGPT assistant participation follows existing ORCA owner consent and active authorized sessions. Closing that session **does not** cause the personal assistant to continue working endlessly in the background.
- A potential future **ORCA-operated** server-side research worker is a **different service**: separately authorized, strictly scoped and budget-capped, using a queued, deduplicated, auditable process.
- Reuse cached evidence across users. Never call a paid research model simply because a player opens a chest or has played for another minute.
- No trades, real-money gambling, pay-to-win, mandatory subscriptions or unapproved account integrations. Free to watch, play, learn and contribute; advertising is separate from research.

## 4. First prototype acceptance criteria
- One polished, compact 3D dungeon, responsive character control, convincing block/dodge/attack, one guardian, one arena encounter.
- Three research-linked chests or discoveries, one for each research realm, with inventory/equip and accessible evidence details.
- Real preverified evidence from the existing Commons used for loot before expensive live-agent jobs.
- An owner-approved new contribution can later add one legitimate unique discovery item, without forcing a ChatGPT agent to run in the background.
- Staging/prototype only until expressly approved; keep the existing site, timelines and research data intact.

## 5. Explicit change-control rule
**LOCKED:** The three names, their mapping, original visuals, full-image aspect ratio, text-over-image treatment, integration inside existing research cards, research IDs, and the ambition of a real 3D research-to-loot RPG.  
**FLEXIBLE:** Specific animations, character visuals, weapon balance, 3D engine, individual mission scenarios and game UI details during prototyping.

When an improvement is proposed:
1. Compare against this baseline and the detailed RPG spec.
2. Mock up the proposed change separately.
3. Get explicit owner approval before changing a locked element.
4. Record approval, date, rationale and affected files here.

## Change log
| Date | Change | Status |
|---|---|---|
| 2026-11-09 | Three world identities approved and illustrated. | Locked |
| 2026-11-09 | Artwork merged into three existing research cards; separate preview row removed. | Locked |
| 2026-11-09 | Full uncropped portrait artwork with names and category labels **inside** the images. | Locked |
| 2026-11-09 | Research-to-Loot 3D RPG direction, independent human/AI roles and cache-first architecture documented. | Vision locked, build pending |
