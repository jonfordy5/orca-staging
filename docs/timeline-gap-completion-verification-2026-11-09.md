# Partial-history completion repair — November 9, 2026

## Confirmed cause

Tesla's initial history run `556aee93-9628-465c-b101-d7925ae71e3b`
returned six candidates, all accepted. Diagnostics show a completed provider response,
not rejected sources, a token failure or a database error. History cost $0.04068;
the independent current-year stage cost $0.03109 and saved its event. Total $0.07177
left $0.07823 of the authorized $0.15 click budget unused.

`shouldTargetFollowup()` required a total of eight or nine milestones and $0.065
headroom. Six could not qualify. Even at eight/nine, the initial $0.075 allocation
minus a realistic $0.04 first search could not meet the headroom rule. The frontend's
`attempted` history scope then prevented reconsideration after current-year research.
It stopped at seven and offered the incomplete action again.

## Repair, within the existing engine

- Any underfilled history is eligible for focused gap research, including initial
  batches of four or six. Existing partial histories begin with focused research,
  rather than another broad full-history request.
- Each provider request uses its actual remaining stage budget when selecting tool
  and output limits. Focused searches stop on no new verified evidence, insufficient
  estimated headroom or a bounded provider-search limit. Current-year funding remains
  protected; optional gap funding cannot starve a missing current-year anchor.
- A click may revisit history once after current-year/founding research, spending
  unused funds on the remaining gaps. It does not repeat a no-progress focused pass.
- The final history stage is explicitly marked. Credible partial results are saved
  with a source, budget or search limitation instead of filling the target with
  insignificant or invented events.
- `completion_details` on existing private generation records stores versioned
  outcomes and scope-specific coverage keys. A free authenticated `status` request
  reuses terminal outcomes. If the shared click runs out before another request,
  the server can settle the outcome from that user's recorded run costs.
- A fresh page never starts paid research. An unchanged terminal outcome does not
  expose another completion action. New saved evidence or a new calendar year
  invalidates the relevant coverage key; an explicitly authorized API request may
  use `force_research:true` to reconsider a prior limitation. No cooldown was added.
- Duplicate prevention now also compares canonical source URL plus event date,
  including renamed events or tracking-parameter variants.
- The existing KISS engine fills only missing cards. No photography rules, CSS,
  geometry, beam animation, cards, responsive layout or research systems changed.

Files: `orca-living-timeline.js`, the cache-version import in
`research-workspace.html`, `supabase/functions/orca-timeline-discovery/index.ts`,
`supabase/migrations/20261109172716_timeline_completion_outcomes.sql`, and the
three timeline consistency/history/completion test scripts. Existing database
reservation/finish functions remain intact. The new JSONB column stays behind
existing generation-record RLS; security advisor counts did not change.

## Live Tesla result

One signed-in click added three historical events and three photographs:

1. October 27, 2010: Fremont factory opening — Tesla's dated investor release.
2. June 22, 2012: first Model S customer deliveries — Tesla's dated investor release.
3. July 28, 2017: first Model 3 deliveries — Tesla's Q2 2017 shareholder letter.

The biography originally returned for Model 3 supports the event/year; direct source
review supplied the shareholder letter for the precise day. The biography URL is
retained in `quick_brief.additional_sources`. The new Model S description was also
edited to distinguish premium-sedan deliveries from a mass-market claim. None of
the seven pre-existing milestones, sources or photographs was replaced.

- Before: six historical events + one 2026 event = seven cards/photos.
- After: **nine historical events + the existing 2026 event = ten cards/photos**.
- All ten photo IDs and original image URLs are distinct; all seven old assignments
  match the baseline exactly. No duplicate milestone titles were found.
- The 2003 founding event and July 22, 2026 earnings event were reused.
- Repair click: **$0.03834 estimated actual research cost**, $0.15 reserved ceiling.
- Original + repair research: **$0.11011**. Reservations are not spending.
- Cached photo-subject queries were reused; no new subject generation was needed.

The starter goal remains approximately ten saved milestones in the existing
workflow, including a current-year anchor. Tesla therefore has nine pre-2026
historical events, not ten historical events plus a bulletin. No fourth event was
invented to turn the target into a rigid quota.

## Verification

All five existing test suites pass. Expanded backend mocks cover initial batches
4/6/8/9/10 using realistic input/output/search costs; rejected sources; renamed and
tracking-URL duplicates; no-progress stopping; preservation of partial results;
recorded cost settlement; cached limitations; and explicit future evidence updates.
Actual frontend-handler mocks cover history/current/history sequencing in one
click, all five partial counts, a $0.149 budget-limited case, no button eligibility
on unchanged limitations, and no provider/photo calls for completed WMT/META/INTC/MCD.

The shared Work browser control remained unavailable, so the user performed the
single signed-in Tesla click in the existing session and confirmed three photos
saved and completion worked. Separate read-only automated browser loads verified
all five stocks, then reloaded Tesla with ten cards and ten photos. No JavaScript
syntax errors occurred. Existing permission-denied messages with empty stacks were
not treated as syntax errors. Browser requests used Node's verified environment
proxy/CA rather than disabling TLS checks.

WMT, META, INTC and MCD retain eleven milestones and eleven distinct original
photographs each. Their photo assignments match the baseline, and there were no
new research runs for them during this verification.

Supabase Edge Function version 17 and the migration are deployed. GitHub run
42665068379 passed the syntax/regression checks and dependent Pages deployment.
The live timeline asset matches the tested repository file. Pages remains in
Actions mode, so publication is gated on those checks.
