# ORCA Living Timeline — rights-aware image sourcing
**Staging implementation:** 2026-11-03. The image-source selector is shared by every company timeline. The company logo and company-description illustration systems are unchanged.

## Pipeline and actual availability
1. **Original company release:** Inspect the exact stored timeline source only if hosted on the approved company website/domain. Metadata including `og:image` is recorded only as a discovery signal. **Never auto-publish** because metadata does not prove reuse permission. Official press-image publishing requires an approved rights registry.
2. **Wikidata and Wikimedia Commons:** Find named event subjects (product, acquired company, executive, launch vehicle), resolve Wikidata P18 when possible, then search Commons file pages. The file title must name that exact subject. Accept only JPEG/PNG/WebP with a recognized commercially reusable CC BY / CC BY-SA / CC0 / public-domain license and an explicit machine-readable license URL, credited creator, source file page, and Wikimedia CDN URLs. Cache origin, creator, attribution, license, query, score, verification date. Label the result as a **subject image**, not a photo from the historical event.
3. **Flickr CC:** **Not enabled**. Requires a reviewed API key, current license definitions, commercial API-use approval when applicable, and per-photo rights checks; activate only after those conditions are satisfied.
4. **Unsplash:** **No longer queried by automatic selection**. Previously selected licensed/hotlinked images remain as `unsplash_legacy` records for continuity. Their original Unsplash credits remain intact. A flagged image is hidden until replaced.

## Strict failure behavior
- Never assume a press-release social preview image grants reuse rights.
- A routine 10-K, earnings filing or financial report is not itself an identifiable visual subject. A clean text card is the correct outcome.
- Do not fill an image slot with a generic industry, competitor, product category, car, factory, stock chart, or photo merely because it contains matching keywords.
- All automated Commons matches are **metadata verified**, not yet visually verified by image-capable AI. Visual verification requires an approved cost and privacy/rights review and is intentionally **disabled**.
- No new Flickr key, OpenAI request, image-download cost, or paid service is activated by this release.
- Searches are initiated only by authenticated, opted-in ORCA researchers and capped at three events per click; the existing 24/day staging photo cap remains in force.
- A photo is never embedded or stored as a local binary by the current selection service; photo bytes are hotlinked to the approved provider.
- The existing photo cache remains available when catalogue endpoints fail.

## Data and release
- Table `public.orca_timeline_photo_selections` adds `source_type`, `source_page_url`, `creator`, `license_name`, `license_url`, `attribution_text`, `rights_status`, `match_type`, `relevance_score`, `query_used`, `verified_at`, `image_hash`, `event_date`, `event_title`, `thumbnail_url`, `image_title`. The original photo URL columns remain compatible with the existing card display.
- Database constraints require HTTPS for images and source links, as well as verified reuse license metadata for newly selected non-Unsplash sources. Former Unsplash-only URL checks were removed.
- Backend source is versioned at `supabase/functions/orca-timeline-photo-fill/index.ts`; deploy only to Supabase staging until QA.
- Frontend `orca-timeline-photos.js` displays Commons creator/source/license and preserves existing legacy attribution.
- Validate new API responses, actual provider images, image attribution and browser/mobile layouts with authorized staging sessions before announcing rollout as fully visually verified.

## Efficacy tests performed with deterministic mocked media metadata
| Company | Event type | Example | Result |
| --- | --- | --- | --- |
| AAP | Financial filing | 2005 annual report | No unique image subject — text card |
| NVDA | Product announcement | GH200 | Named subject recognized; licensed exact-subject file accepted |
| ULTA | Acquisition | Space NK | Named subject recognized; filename match required |
| RKLB | Space mission | Electron | Named subject recognized |
| MSFT | Leadership | Appoints Jane Doe CEO (synthetic example) | Named person recognized |
| AAPL | Product launch | iPhone | Named product recognized |

**Rights regression fixtures:** Accept CC BY-SA 4.0 with explicit license URL and creator; reject a wrong-file subject, NC-licensed file and file without verified reuse terms. These are logic tests with synthetic media metadata, not a claim of live provider accuracy or completed AI visual review.

### Deferred work
- An approved official-press image rights/host registry.
- Flickr commercial/API access and a license-driven Flickr integration.
- Approved AI image-content verification (currently disabled due to potential cost).
- Real-world cross-company acceptance tests with source-by-source results and browser screenshot review.
