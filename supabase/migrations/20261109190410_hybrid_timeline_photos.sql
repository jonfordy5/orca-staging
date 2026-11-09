ALTER TABLE public.orca_timeline_photo_jobs
 ADD COLUMN IF NOT EXISTS brand_search_version smallint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS brand_diagnostics jsonb;
ALTER TABLE public.orca_timeline_photo_selections
 ADD COLUMN IF NOT EXISTS previous_photo jsonb;
COMMENT ON COLUMN public.orca_timeline_photo_selections.previous_photo IS
 'Preserved original credited photograph when a one-time brand upgrade replaces a contextual cover.';
