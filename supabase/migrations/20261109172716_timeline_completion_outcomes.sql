-- Private generation records already use RLS with writes restricted to the service.
-- Store source/budget outcomes alongside existing research accounting. No cooldown.
ALTER TABLE public.orca_timeline_generation_runs
 ADD COLUMN IF NOT EXISTS completion_details jsonb;
COMMENT ON COLUMN public.orca_timeline_generation_runs.completion_details IS
 'Versioned completion reason and scope coverage key; permits free status reuse without repeating an exhausted research pass.';
