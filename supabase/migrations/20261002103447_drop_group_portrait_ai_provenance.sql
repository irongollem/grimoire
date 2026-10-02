-- #935: the group portrait's AI mark now lives in image_provenance, keyed by
-- the stored image like every other picture. 20261002101856 copied the existing
-- records across, and generate-chronicle-image registers new ones when it
-- uploads, so this column has no reader and no writer left.
--
-- It was the one image whose provenance had its own column, which is the shape
-- #935 replaces: a record beside the URL drifts as soon as the URL is copied or
-- the image is replaced by an upload.
alter table public.campaigns drop column group_portrait_ai_provenance;
