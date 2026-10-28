# ORCA staging checkpoint — October 27, 2026 (CDT)

## Mission and boundaries
AI Stock Commons — Powered by ORCA is a collaborative, opt-in, owner-authorized stock research website. Personal ChatGPT Work researchers claim stock metrics, independently source findings, and publish under their own authorized identities. Staging: https://jonfordy5.github.io/orca-staging/research-workspace.html?environment=orca-staging&ticker=NVDA . Preserve production (`jonfordy5/agent-learning-commons`) and the curated Rocket Lab company profile as the layout/template. No trades.

## Verified NVIDIA achievements
- Existing signed-in identity: **ORCA Test Researcher 1**. NVDA membership, consent, and independent publishing all passed in the Work test.
- NVIDIA Fundamentals & Valuation historical finding published **Oct 27, 2026, 10:50:38 PM CDT**: original **HOLD — 60% bullish lean**, with four sources, limitations and review triggers. Do **not** rewrite/delete this historical record.
- NVIDIA Technical Analysis finding published **Oct 27, 2026, 11:15:25 PM CDT**: **SELL — 62% Bearish**, with two sources, updated limitations, observation time; public appearance verified by owner and Work. Assignment resumed from prior draft; no duplicates.
- Research publishing failure `2201B: invalid regular expression: parentheses () not balanced` was fixed by replacing malformed staging regex validation with deterministic four-rating header parsing and dropping redundant malformed trigger. Database test verified four valid examples accepted and HOLD, mismatch, bad conviction, old format rejected; no test data retained.
- Four new ratings only: STRONG BUY, BUY, SELL, STRONG SELL with integer directional conviction 51–100%. HOLD is **not selectable or publishable** going forward. Historical HOLD stays in read-only archives.
- Compact assignment packet reports owner independent publishing ENABLED; layout widened for public findings. The unavailable historical-price Living Timeline has explanatory fallback and the TradingView chart remains available.

## UI and gauge improvements committed to staging
- `b24ba3a`: gauge computes net directional conviction over the latest eligible finding for each **researcher × distinct metric**. Bullish is negative, Bearish positive for net signed calculation; opposing directions cancel, with center meaning balanced. Historical HOLD does not contribute. A headline displays the value. The 62% Bearish Technical Analysis finding is currently the only eligible NVDA rating.
- `7a9015b`: three overview cards use **actual research metric** rather than the question metadata chosen at publication: Fundamentals & Valuation -> Appraisement; Technical Analysis, Volume and Options -> Positioning; SEC, News & Market Sentiment -> Performance. Short preview and expandable full report, limitations, sources. Category tree shows current eligible reports plus historical findings in archive.
- Other commits: `7ffcab6` (four-rating form and wide findings), `977c6d4` (Work packet), `cbe07d4` (timeline fallback), `516a35f` and `6dc1a76` (instruction/fallback polish).
- The owner's screenshot on Oct 27 showed an **old version** of the three-column cards (Technical Analysis in Appraisement). Likely stale browser page/cache; the repository has new metric-based routing but a live refreshed-browser check remains advisable. No changes were made after user said they found the second report.

## Next session
1. Open the **staging NVDA** URL freshly and hard refresh if needed. Verify Technical Analysis now appears in **Positioning**, the **62% Bearish** active gauge updates, and historical Fundamentals HOLD remains available via archive (not counted in gauge).
2. Run NVIDIA **Research Test #4: News & Market Sentiment** in ChatGPT Work using the existing account. If an active claim exists, resume; otherwise claim the available metric. Independently research current, dated credible sources; rate STRONG BUY/BUY/SELL/STRONG SELL, 51–100% directional conviction, or do not publish if insufficient evidence. Confirm owner authorization, post exactly one finding and verify timestamp, identity, sources, and that the gauge recalculates across eligible distinct metrics.
3. Report any remaining bugs; preserve old research. Do not touch production, Rocket Lab's curated template data, or run real trades.

## Company profile data
Staging shared template: curated Rocket Lab; auto-fetched FinanceDatabase business descriptions, Wikipedia/Wikidata/Commons for other tickers. Logo.dev publishable key is configured for ticker logos for non-RKLB companies with source/fallback handling. No paid API required yet.

**Status:** User ended session for rest. No background work or new scan is running from this checkpoint.
