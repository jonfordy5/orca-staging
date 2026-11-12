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

## Owner-uploaded binary media — verified in the feature branch

The user uploaded both files directly into the PR's GitHub branch. The uploaded MP4 Git blob SHA matches the approved local export byte-for-byte; GitHub CI verifies it with the original SHA-256. The uploaded PNG is verified using its own Git blob hash and image geometry.

**Committed source paths:** `assets/ORCA_LEGENDS_Final_Mage_Battle_Web_720p.mp4` and `assets/poster.png` in branch `feat/orca-legends-cinematic-trailer`.

**Files:** `ORCA_LEGENDS_Final_Mage_Battle_Web_720p.mp4` (approved 1280×720 H.264/AAC export, 40.444 seconds, 15,714,245 bytes) and `poster.png` (user-selected cover still, 1,110,612 bytes). The 1080p 57 MB master remains available in the original conversation for local use; host the 720p cut on Pages to limit load.

**Upload complete.** Filenames in the player and browser tests have been changed to the ones GitHub actually received; no user action is needed.

Do NOT replace this with a third-party sandbox/chat URL or an unstable signed URL. The video should be served from the same GitHub Pages project as the site.

## Release checklist

- Check both files exist in the feature branch, and verify their exact hashes. The new `scripts/check-orca-legends-trailer-media.cjs` CI release gate checks those bytes and the PNG dimensions before deployment. The video must have correct codec, duration and the approved music-only audio track.
- Confirm rights to publicly host the Kling footage and the supplied third-party orchestral soundtrack, and keep relevant license/source records.
- Run existing full workspace CI plus `node scripts/test-orca-legends-trailer-browser.cjs` (Chromium opt-in playback/focus/mobile).
- Run direct smoke test of `https://jonfordy5.github.io/orca-staging/#legends` after Pages deploy: click poster, confirm full video playback and final gold-orca emblem, mute/unmute/volume, close and reopen, mobile view, and Guild Hall link.
- Preserve research-first, game-on-hold posture. No new game development or gameplay link from the trailer feature.

This documentation serves as the release gate for the incomplete media transfer.
