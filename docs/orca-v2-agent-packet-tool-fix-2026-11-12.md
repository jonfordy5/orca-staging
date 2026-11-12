# ORCA — fix stale WebMCP assignment packet

**Issue found November 12, 2026 during independent RKLB A/B acceptance.**

## Confirmed cause

- The **live staging** task ledger recorded one active, owned RKLB `Volume` claim with `volume.relative`, board key `positioning` (**Investors**), due 1:22 p.m. America/Chicago.
- The older browser tool `commons_read_assignment_packet` in `commons-site-tools.js` emitted `ORCA_AGENT_PACKET_V1`. It marked a claim active only if `#myclaim` started with the exact text `Claimed:`.
- The real, current `research-workspace.html` renders `#myclaim` starting with `Task ID:`. Thus the tool falsely reported no active assignment, even after refresh; this is deterministic, **not proof of concurrency, delayed writes, missing consent or a failed claim**.
- The same workspace already produces `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2` inside the existing expandable **Research timeline · Compact agent evidence packet** section. That V2 packet derives its assignment from the authenticated current-user `commons_my_claim` result plus `orca_my_assigned_board` for the same task.

## Change in this PR

Make `commons_read_assignment_packet` **read the canonical V2 JSON from the existing DOM**, validate its schema/ticker, and confirm the existing visible task ID and assigned board match. When the packet hasn't loaded, or any data mismatches, report a safe error requiring a refresh and **never suggest a second claim**.

- No new RPC or direct-table query.
- No publication, task claim, consent change, login, browser navigation, AI generation or new permissions.
- No changes to the existing V2 packet schema or live research findings.
- The read-only public research-board tool remains intact.
- The test suite recreates the exact `Task ID:` versus old `Claimed:` mismatch, success with a matching V2 packet, and failures for stale/mismatched/empty packets.

## Manual acceptance in a real signed-in browser

1. In the participant's **existing Work browser**, open their original `RKLB` workspace and click **↻ Refresh status**.
2. Confirm `My assignment` displays the *same* still-active task, Volume, Investors and deadline. Do not claim a new task.
3. Expand **Research timeline · Compact agent evidence packet**, verify `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2` and exact same task ID, metric and board.
4. Read through independent research from original dated sources, honoring current consent and publication settings. Publish once while the actual task remains active; if it expires, stop and report rather than forcing submission.
5. Once this PR is reviewed and deployed to staging through normal CI, the browser's `commons_read_assignment_packet` tool should return that same canonical V2 and refuse to misreport a live claim as absent.

**Test validity:** This PR fixes the tool, **not** the live research mission. The A/B acceptance remains incomplete until the second person's own genuinely sourced publication is verified against the task and account ownership.

Related: [two-person acceptance #54](https://github.com/jonfordy5/orca-staging/issues/54).


## Follow-up: expired assignment and sign-in state (1:35 p.m. CST, November 12)

The second participant correctly stopped when the real V2 packet returned `assignment: null`, `My assignment` indicated **Not signed in**, and the task was already beyond its 1:22 p.m. deadline. Owner-authorized read-only staging verification at approximately 1:36 p.m. confirmed:

- The original RKLB Volume / Investors / `volume.relative` task was still recorded as claimed with the original deadline **in the past**.
- No finding was attached to that task, and no extra claim was created.
- This is **not** evidence that the canonical V2 packet is broken. A signed-out session cannot fetch its owner-bound claim. The precise reason the Work browser lost its signed-in state remains unknown; the Supabase client already enables `persistSession` and `autoRefreshToken`.

The fixes now also:
- Refuse to treat a V2 `assignment: null` as a valid owner-session check if the visible workspace says **Not signed in**; return clear sign-in-in-the-same-Work-browser guidance.
- Revalidate the authenticated identity **during every workspace refresh** before requesting its current claim or relying on cached user/permission state. This helps when signing in or out in another page of the same Work browser and avoids owner-identity reuse across account changes.
- Leave claim expiry, auth policies, existing assignments, accounts, and all research rows unchanged.

### Correct recovery

Sign back in to the **same existing account** in that Work browser, return to the same ticker workspace, refresh and verify identity and `My assignment`. The original expired assignment cannot be published. Only if **My assignment** shows no active task after sign-in and permission revalidation may the researcher start another genuine mission using the existing **Claim next research** control once. This must be an independently assigned new task, not a retry of the expired task, and must satisfy the new deadline; alternatively stop if authorization or a new valid assignment is unavailable.

Do not fake a finding, extend deadline directly, alter permissions, duplicate research, or assume automated expiration cleanup occurred merely because the lease is in the past.
