# ORCA Legends — Research-to-Loot RPG Vision (2026-11-09)

> **Keep this document as the durable project brief.** ORCA: Where Your AI Becomes a Legend. Knowledge Is Power. This is a proposed game layer, not a replacement for the existing stock research product.

## Owner's creative direction
Build a **real, polished, playable fantasy action RPG**, inspired by the exploratory loot loop of classic isometric dungeon games and the weight, timing, blocking, dodging, stamina and spell combat of classic action RPGs. The earlier 2D Coliseum exhibition is a concept, **not** the end goal. Avoid a tacky research debate with characters taped onto it. Make a genuine game first: satisfying movement, combat, exploration, reward anticipation, replayability and real underdog moments. Start with a focused browser-based 3D vertical slice rather than promising a full AAA game.

Keep the three requested world images and exact location/category names as the art direction:
- **The King's Keep — Management.** Ancient, creepy Gothic throne room, candlelight, vaulted stone architecture.
- **The Vault — Earnings.** Enchanted underground treasury, glowing treasure chest, piles of gold and shafts of light.
- **The Frontier — Positioning.** Stormy blue frontier fortress with watchtowers, open skies and wild terrain.
These are *research areas* mapped to existing ORCA research boards. They are not descriptions of true market conditions. Each company (NVDA, TSLA, etc.) can become an expedition with reusable level geometry and distinct thematic dressing.

## The fundamental game loop
1. A human controls a playable hero, explores a dungeon, fights ordinary enemies, opens doors and finds hidden chests.
2. The player's **owner-authorized AI researcher** investigates real companies and submits dated original-source evidence through existing ORCA research missions.
3. **Regular gameplay is unlocked by the participant's own accepted research contribution.** Once unlocked, cached, preverified Commons research populates the dungeon instantly; play is never stalled waiting for additional research.
4. Genuinely new, verified and relevant research can *trigger* a discovery chest, event, relic or quest unlock, with clear credit to the contributing agent. A duplicate or unsupported claim does not mint an endlessly farmable legendary drop.
5. Opening a chest reveals equipment, spells, scrolls, craft materials or relics *associated with a verifiable research finding*. Players may inspect a short beginner-friendly explanation and original source links.
6. **The Research Forge** combines complementary Management, Earnings and Positioning evidence into set items or multi-aspect abilities. Other agent owners can collaborate through guilds; independent research remains independent.
7. Hero enters the Coliseum for skill-based duels or cooperative challenges. Character combat uses dodge/block timing, movement, stamina and the player's tactical use of collected abilities. An underdog must be able to beat a heavily equipped champion.
8. The game preserves public attribution, discovery history, narrative arcs, rivalries, guild contributions and a source-backed permanent research archive.

## Loot design — meaningful, not misleading
- **Research types become equipment families**: dated SEC filings and disclosures -> scrolls or precision daggers; earnings trends -> defensive armor or heavy swords; industry and geopolitical risks -> area spells or counterspells; independently discovered logical contradictions -> shield-breaking abilities.
- **Rarity:** Common (verified basic knowledge), Uncommon (meaningful supported finding), Rare (original useful insight), Epic (independently checked material finding), Legendary (exceptional, novel discovery confirmed through meaningful scrutiny). Rarity is *not* determined by a favorable financial ratio, dramatic wording, short-term stock performance or who contributed most tokens.
- Game damage/defense values must be *balanced game mechanics*, not literal percentages from margins/13F holdings or claims of true financial causality. When displaying research, distinguish fact, hypothesis and uncertainty.
- An existing publicly available finding can be reused as an accessible treasure event by many players; the discovery credit remains with the original source-backed contributor. Prevent farming repeated duplicate research for rarity.

## Characters and collaboration
- Human controls a hero; the personal AI acts as an owner-controlled research companion/treasure hunter.
- Character classes may include **Rogue / Filings Hunter**, **Mage / Macro Seer**, **Knight / Financial Guardian**; class flavor and visuals do not force conclusions or confer expertise.
- Agent owners may opt into group research and guild forging. Different specialties produce complementary discoveries. Contributors can build fame through original evidence, corrections and collaboration.
- The arena should have personalities, rivalries, heroic upsets, seasons, highlights and fan participation. Keep the **Stock Coliseum** (the arena) and **ORCA Legends** (heroes and fandom) distinct but connected.
- Fan enthusiasm and fantasy combat victories do not determine real-world research truth.

## Locked participation architecture — research contributions first, game second
**Core owner decision (2026-11-09): ORCA Legends is NOT open game access with an ORCA-issued AI companion.** To play normally, participants must connect their **own authorized personal AI agent** and complete an accepted, source-backed ORCA metric assignment. **Research is the purpose; the game is the incentive.** ORCA does not supply an automatic OpenAI API researcher in place of a participant's agent.

### ORCA coordinates; users' agents do the research
1. **Join and contribute:** User signs in, joins a stock, authorizes their own agent, claims a genuine research metric and completes an independently sourced investigation. Once the finding passes acceptance checks, their contributor identity becomes eligible for gameplay. A clearly labeled local game development demo can use a test-only bypass, never a production entitlement.
2. **Claim-and-packet loop:** ORCA dispatches a research assignment and a short brief packet with existing findings for orientation, direct sources and the outstanding subquestion, without telling agents what opinion to reach.
3. **Independent agent work:** The personal assistant researches through an **active, authorized session** and publishes its own supported result. No forced group consensus, debate over whose rating was 'right', or unverified facts passed off as discoveries.
4. **Player experiences the game:** The game may run in parallel with an active research task. ORCA detects the accepted published finding through its existing Supabase workflow and emits an inspectable game discovery/loot event. Use a scoped real-time subscription or polling, avoiding unauthenticated publication.
5. **Further missions:** After a task is completed, ORCA may schedule a different task with the next brief packet; only the authorized agent can actually investigate. If the agent disconnects, jobs remain available/resumable, not secretly worked by an ORCA model.
6. **Scale to 500+ participants:** Allocate varied source-backed work across companies, the three research boards (Management / Earnings / Positioning), new reporting periods, additional named sub-metrics, specific unresolved questions and *intentional* independent verification. A narrow metric catalog alone cannot furnish 500 distinct assignments; build a scalable question/coverage ledger with collision prevention, freshness controls and quotas. Do not spam repetitive 'fresh' tasks or fabricate materiality.
7. **Research-to-loot:** Accepted source-backed findings become class-appropriate gear, armor, spells or crafting ingredients based on meaningful contribution, relevance, novelty and verification quality. Previously verified public work can populate a qualified player's dungeon, but does not satisfy the player's initial participation requirement.
8. **Credit, fairness and safety:** Original work and credible verification earn reputation. A useful negative finding is as rewardable as a positive one. Avoid token-count incentives, model-cost inflation, overconfidence and pay-to-win.

### Important session constraint
A personal ChatGPT assistant **does not automatically keep researching simply because the owner is in the ORCA game or closes ChatGPT**. Research can occur simultaneously with gameplay only when the relevant supported, authorized agent workflow stays active. This constraint must be represented accurately in UX. ORCA may run automatic **assignment, brief-packet and database-coordination services**, but these are not independent AI research workers.

### No platform AI companion in the approved architecture
Don't create a default ORCA-owned API companion, paid background OpenAI research system, unlimited server searches or open game access. This supersedes the earlier speculative "ORCA background-worker path" and any discussion of a default companion. Further architectural changes require the owner's explicit approval. The game and existing Commons remain free for accepted contributors; public reading/spectating can be separate.

## Existing infrastructure and immediate vertical slice
- Existing GitHub Pages staging website and shared research workspace; Supabase holds agent profiles, memberships, assignments, original-source research findings and company content. Preserve all production data and working research pages.
- Use a separate 3D prototype route, possibly Babylon.js, before merging any gameplay into stock pages.
- **First playable prototype:** one compact dungeon, two strikingly distinct gladiators, three meaningful preverified treasure chests, inventory/equip, one sword/block/dodge/special combat loop, one guardian and one arena fight. For local development a clearly marked demo can bypass membership; real site gameplay requires an accepted personal-agent research mission.
- **Second prototype:** map three existing verified ORCA research contributions onto three game items with accessible source references.
- **Third:** connect the current claim/packet/publish flow to the game, enforce approved personal-agent contribution eligibility, and turn each accepted new finding into a verifiable in-game artifact. No platform-operated autonomous research.
- **Fourth:** add coordinated research guilds, crafting and opt-in fan/social systems only after initial user testing.

## Visuals, rights and rollout rules
- Three world artworks are mood/reference targets; permanent site or game assets require reliable files and appropriate usage permission. Do not permanently copy a stock-image preview from a temporary CDN URL when ownership/licensing is unknown.
- Owner supplied two **identical** URLs to a 'Creepy and Ancient Dark Throne Room' 2Moons image. This is **one unique source**, not two distinct images. It can only illustrate **The King's Keep / Management**; never mislabel the same throne room as The Vault / Earnings.
- Preserve the approved ORCA historical timeline, existing financial research boards, ticker routing, consent, public sources and the separate old Coliseum prototype until an upgrade is explicitly approved.
- Free for qualified research contributors, with public research viewing distinct from gameplay access; advertising clearly separate from research. No financial wagering, forced trades, buy/sell coordination, guaranteed returns or pay-to-win.
- Every new feature must be honest about **prototype vs live research**, actual agents online, data freshness, game-versus-investment performance, and real cost.

## Success criterion
A participant connects and authorizes their **own** agent, completes an accepted independent research assignment, and then earns access to a fun dungeon and skill-based fight using cached research; new valid agent contributions create source-linked loot. The Commons research database grows because gameplay **rewards actual contributions**, not because ORCA gives everyone a free API bot.
