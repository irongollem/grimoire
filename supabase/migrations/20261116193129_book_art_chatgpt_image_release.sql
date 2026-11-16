-- Migration: book_art_chatgpt_image_release
-- Corrects the model named on the setting-book art already disclosed as AI-generated.
--
-- The book scripts (scripts/lib/bookImages.ts) marked every picture from the GPT art
-- pipeline as gpt-image-2. The pipeline paints in ChatGPT and began on 27 Oct 2026,
-- after ChatGPT Images 2.5 shipped (8 Sep 2026); ChatGPT Images 2.6 followed on
-- 4 Nov 2026. So a picture generated before 4 Nov was painted on gpt-image-2.5 and
-- one generated on or after it on gpt-image-2.6. ChatGPT does not say whether flare
-- or sunburst drew it, so the label is the family, as bookImages.ts now writes it.
--
-- Only the rows change: they are what the app's AI badge reads. The XMP packet
-- embedded in each stored file keeps the old label, because rewriting the bytes
-- would change every content-addressed key and the URLs that point at them.
-- `generatedAt` is the source file's save time; the guard on 8 Sep leaves alone
-- anything older, which really was gpt-image-2. Other generator types (the
-- Chronicler, entity art) recorded the model the API reported and are untouched.

update public.image_provenance
set provenance = jsonb_set(
  provenance,
  '{model}',
  to_jsonb(case when provenance ->> 'generatedAt' >= '2026-11-04' then 'gpt-image-2.6' else 'gpt-image-2.5' end)
)
where provenance ->> 'generatorType' = 'setting-book-art'
  and provenance ->> 'model' = 'gpt-image-2'
  and provenance ->> 'generatedAt' >= '2026-09-08';
