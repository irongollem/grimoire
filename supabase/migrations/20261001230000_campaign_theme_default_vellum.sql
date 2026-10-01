-- Vellum is the house theme (#938). New campaigns get it by default; the
-- client also sends DEFAULT_THEME_ID explicitly. Existing campaigns keep the
-- theme they have.
ALTER TABLE public.campaigns ALTER COLUMN theme SET DEFAULT 'vellum';
