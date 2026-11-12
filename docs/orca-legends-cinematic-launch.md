# ORCA Legends — Cinematic Trailer Entrance

## What this change delivers

A full-width featured ORCA Legends cinematic area on the existing ORCA Commons homepage (`index.html#legends`), with a gold-orca crest poster, cinematic copy and explicit **Watch the Cinematic Trailer** action. Clicking opens an accessible, opt-in video player.

- Trailer opens only on direct user action; no page-load audio or background downloads (`preload="none"`).
- Full volume player controls remain available, respecting user device/browser settings.
- Keyboard Escape, close button and backdrop dismiss the trailer, pause playback, reset position and restore focus.
- Mobile responsive at 320px, 393px and desktop.
- The game remains gated/separate. The teaser routes to the existing Guild Hall; it does not launch, unlock or modify any game.
- Original research, sign-in, Supabase, ORCA Engine and research database unchanged.
- A custom, lightweight vector gold-orca teaser poster ships in `assets/orca-legends-trailer-poster.svg` until any separately licensed raster poster is uploaded.

## Required binary upload — NOT YET PRESENT

This connected GitHub editing workflow can write repository text but **cannot transfer the video bytes from the chat's local filesystem**. The final 720p H.264/AAC media asset must be uploaded **before merging this PR**. Do not merge/deploy an unavailable video.

**Required exact destinations:** `assets/orca-legends-final-trailer-720p.mp4` and `assets/orca-legends-trailer-poster.jpg` in branch `feat/orca-legends-cinematic-trailer`.

**Files:** `orca-legends-final-trailer-720p.mp4` (provided in the conversation to the user), 1280×720, 40.444 seconds, 15,714,245 bytes, and `orca-legends-trailer-poster.jpg` (the user-approved gold orca still). The 1080p 57 MB master remains available in the original conversation for local use; host the 720p cut on Pages to limit load.

**Simple user-facing upload:** open the target branch in GitHub, select `assets` → **Add file → Upload files**, drag the named MP4 and approved JPG poster into that one upload page, and commit directly to that feature branch. No code editing required. A connected Work session with the attachment and repository write access could also upload the file.

Do NOT replace this with a third-party sandbox/chat URL or an unstable signed URL. The video should be served from the same GitHub Pages project as the site.

## Release checklist

- Check both files exist in the feature branch, and verify their exact hashes. The new `scripts/check-orca-legends-trailer-media.cjs` CI release gate checks those bytes before deployment. The video must have correct codec, duration and the approved music-only audio track.
- Confirm rights to publicly host the Kling footage and the supplied third-party orchestral soundtrack, and keep relevant license/source records.
- Run existing full workspace CI plus `node scripts/test-orca-legends-trailer-browser.cjs` (Chromium opt-in playback/focus/mobile).
- Run direct smoke test of `https://jonfordy5.github.io/orca-staging/#legends` after Pages deploy: click poster, confirm full video playback and final gold-orca emblem, mute/unmute/volume, close and reopen, mobile view, and Guild Hall link.
- Preserve research-first, game-on-hold posture. No new game development or gameplay link from the trailer feature.

This documentation serves as the release gate for the incomplete media transfer.
