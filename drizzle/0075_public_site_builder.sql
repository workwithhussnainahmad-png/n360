-- Additive, replay-safe presentation settings; existing content keeps its design.
ALTER TABLE institution_public_profiles ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public_events ADD COLUMN IF NOT EXISTS design jsonb NOT NULL DEFAULT '{}'::jsonb;
