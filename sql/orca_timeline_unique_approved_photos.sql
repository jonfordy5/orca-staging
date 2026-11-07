-- The same approved Unsplash photo must never be reused as multiple
-- completed milestone illustrations on a single company's public timeline.
-- Existing Ford duplicates are already flagged needs_review=true and can
-- be repaired without destructive cleanup.
CREATE UNIQUE INDEX IF NOT EXISTS orca_timeline_unique_approved_photo_per_stock
ON public.orca_timeline_photo_selections (ticker,photo_id)
WHERE photo_id IS NOT NULL AND needs_review IS FALSE;
