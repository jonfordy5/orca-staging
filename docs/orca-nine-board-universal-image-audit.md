# ORCA universal company timeline — nine-board reverse engineering

**Audit date:** 2026-11-08. **Scope:** nine existing sourced company histories, their cached image selections, the shared renderer, and the photo selection functions.

## Verified baseline

| Board | Milestones | Photos | Discovery that worked | Failure or accuracy risk |
| --- | ---: | ---: | --- | --- |
| AAP | 10 | 10 | Generic, varied car engines and parts instead of impossible press-release photos | Strict brand/retail filters initially rejected car components and acquisitions |
| AAPL | 12 | 12 | Phones, tablets and computers are recognizable | A modern iPhone on the 1976 founding milestone is **illustrative**, not documentary |
| AMZN | 10 | 10 | Short company, Kindle, packages and acquisition-brand queries | Exact acquisition history often yields general Amazon imagery |
| DG | 12 | 12 | Convenience-store shelves, grocery, NYSE, leadership and Mexico contexts | A Lawson convenience-store photo can illustrate retail but is not Dollar General |
| F | 11 | 11 | Search `ford` and model/era variants | A 1933 Ford hot rod is not the Model T; “exact subject” ≠ exact event |
| MSFT | 12 | 12 | Computers, software, offices, Microsoft branding | Acquisition and earnings photos can be merely related scenes |
| NVDA | 12 | 12 | GPU, processors, chips, circuit boards and data centers | Generic chip photographs do not authenticate NVIDIA products |
| RKLB | 11 | 11 | Search `rocket` first; generic launches and properly credited Wikimedia images | Exact Rocket Lab phrase was too scarce; cartoons and toys must be rejected |
| ULTA | 12 | 12 | Cosmetics, stores, beauty products; Commons rescue | Repetitive beauty-store photos can feel duplicated despite different IDs |

**Live metrics:** 102/102 milestone image records; 102 distinct photo IDs and original URLs; no review flags in the database. Sources: 95 legacy Unsplash images, 7 Wikimedia Commons images (6 Rocket Lab, 1 Ulta). **Caution:** database flags and matching labels are not proof of manual visual or historical verification. Among the 102, only 33 were labeled `exact_subject` and 69 `contextual`. An exact subject is not an exact event.

## Lessons from failures

1. **Literal-event searches fail.** Unsplash is an artistic image catalog, not a historical press archive. Search a recognizable visual noun first, then branded or event-specific variants when useful.
2. **Overly strict filters produce blanks.** Accept visually relevant, distinct, genuine subject photographs as illustrations. Never claim a generic scene is a historical event photograph.
3. **Brand-first always is wrong.** For Rocket Lab, `rocket` outperformed `Rocket Lab`; for AAP, `car engine` outperformed its company name. Preserve genuine branded images when found.
4. **Relevance is contextual.** A battery is relevant to an auto-parts chain, but a random car showroom is not. Source metadata must describe the subject. Query terms alone are insufficient evidence.
5. **Duplicates are unacceptable.** Reserve selected source IDs and original image URLs. Preserve existing valid choices. Never reuse old cards as fake filler.
6. **A blank or white card breaks visual continuity.** Distinct original local vector art, clearly identified as art rather than a photograph, is the guaranteed fallback if a verified photo is absent or a CDN fails. It requires no API access, does not enter the licensed-photo database, and does not inflate photo coverage counts.
7. **Licensing and attribution matter.** Unsplash images follow the existing provider integration; Commons images must have an approved reuse license, a source page, a valid image URL and attribution. Reject NC/ND licenses. A photo and its underlying historical milestone have independent provenance.
8. **Quota must remain bounded.** Stop searching once enough eligible distinct candidates cover the outstanding events. Keep the development 300-photo rolling allowance and provider metadata, and never start paid milestone research without authorization.

## Universal implementation

The existing shared ticker workspace and historical milestone discovery remain intact.

**Image retrieval and scoring:**

1. Resolve verified ticker, company name and available sourced operating description from the registry/cache.
2. Infer a visual sector using rules (retail, beauty, semiconductor, automotive, aerospace, healthcare, biotechnology, banking, utilities, industrial, food, media, etc.). Unknown sectors get a neutral *business technology* visual guide rather than invented company photos.
3. Retrieve image candidates using company and **short industry-specific subject queries**, with broader rescue searches if event cards remain unfilled. Existing nine-board special cases continue working.
4. Validate URL host, metadata, sector subject, explicit exclusion terms, provider rights and company conflicts. No positive score from the query alone.
5. Rank by company/event relevance, then authentic sector subject, distinct photographic IDs and photographer diversity. Assign one real image per event; preserve already-cached selections.
6. If real images are scarce, show a **distinct deterministic abstract SVG** derived from ticker and event ID as a temporary cover. The UI must label it as original illustrative art; it never enters the photo database and never counts as a real photo.
7. Display exact provenance and license in the popup; handle image-load failures with the same distinct fallback.
8. Cache successful choices and expose manual `Find photos` while events still lack real photo records. Opted-in researcher authorization and provider ceilings remain mandatory for image searches.

**Release gates:**

- Every sourced milestone is readable and has a dark, nonblank visual surface on desktop and mobile.
- No duplicated photo IDs or identical original image URLs within a ticker.
- Real photos are not fabricated. Artwork never masquerades as historical photography or increments saved-photo counts.
- Distinct sectors use their own photo subjects; no cross-sector contamination.
- Existing TradingView chart, zigzag, connected stems, traveling beam, open-ended tail, 570px desktop layout and swipe-based mobile view are unchanged.
- Signed-in authorized visitors can add real photos progressively; public anonymous visits show cached images/art without consuming quota.
- Automated tests cover the nine-board behavior, new sectors, license validation, rejection, quota, and unique fallback art.

## Meaning of “no blanks”

**Guaranteed for existing sourced milestone cards:** an image-backed or original-art-backed cover that visually fits the approved design. **Not guaranteed:** that every public stock will have researched historical milestones immediately; source-backed history generation still requires valid evidence, research authorization, quotas and budget. **Not guaranteed:** that every event has an exact historical photograph. The UI must preserve those distinctions.

## Next-stage quality assurance

A human visual audit should flag mismatched eras, competitor logos, generic imagery mistakenly implied as documentary evidence, incorrect visual subjects, broken thumbnails, low-resolution images, and repeated compositions. The first candidates for review include AAPL's 1976 founding image, Ford's Model T-era imagery, and DG's Lawson storefront. The data currently labels all 102 as `needs_review=false`, which means only that the automated selection pipeline did not flag them.

## Visual contract (locked)

Do not redesign the approved timeline: dark blue card covers, readable gradient/white text, connected zigzag and photo stems, no circle nodes, one moving bright tapered beam, fading extension beyond the last milestone, dates on every node, middle-milestone initial centering, TradingView above it, and simple swipe cards on mobile. Preserve 570px desktop frame and modular photo overlays.
