-- Migration: verbatim_copyright_notices
-- Replaces the descriptive placeholder notices with the publishers' actual
-- OGL section 15 / ORC lines, now that a primary source for them has been found.

-- Where these came from: Open5e's own repository carries a `copyright` field per
-- document (`data/v1/<key>/Document.json`) — their compiled section 15 compliance
-- text, which powered the retired v1 API and which v2 no longer exposes at all.
-- That is the chain we are actually in: we copy Open Game Content from Open5e, so
-- the notice attached to what we copied is the one section 6 asks us to carry.
--
-- Every line below is reproduced exactly as published, including the things that
-- look like our mistakes and are not: "Tome of Beasts." for the 2023 edition,
-- "©2022" with no space, and "Briand Suskind" for Brian Suskind. Section 15 asks
-- for the exact text of the notice, not a corrected one.

update "public"."content_sources" set "copyright_notice" =
  'Tome of Beasts. 2023 Open Design LLC. All rights reserved.'
  where "key" = 'tob-2023';

update "public"."content_sources" set "copyright_notice" =
  'Tome of Beasts 2. Copyright 2020 Open Design LLC; Authors Wolfgang Baur, Celeste Conowitch, Darrin Drader, James Introcaso, Philip Larwood, Jeff Lee, Kelly Pawlik, Brian Suskind, Mike Welham.'
  where "key" = 'tob2';

update "public"."content_sources" set "copyright_notice" =
  'Tome of Beasts 3. ©2022 Open Design LLC. All rights reserved.'
  where "key" = 'tob3';

update "public"."content_sources" set "copyright_notice" =
  'Tome of Heroes. Copyright 2022, Open Design; Authors Kelly Pawlik, Ben Mcfarland, and Briand Suskind.'
  where "key" = 'toh';

update "public"."content_sources" set "copyright_notice" =
  'Deep Magic for 5th Edition © 2020 Open Design LLC; Authors: Dan Dillon, Chris Harris, and Jeff Lee.'
  where "key" = 'dmag';

update "public"."content_sources" set "copyright_notice" =
  'Open5e.com Copyright 2019. Authors: Ean Moody and Open Source Contributors from github.com/open5e-api.'
  where "key" = 'o5e';

-- Creature Codex had two competing verbatim lines: Kobold Press's own Midgard
-- section 15 page ("Creature Code © 2018 Open Design; Authors: Wolfgang Baur,
-- Jeremy Hochhalter, Chris Lockey, Joel Russ, and Jon Sawatsky.") and Open5e's
-- fixture below. Taking Open5e's: it names the product correctly, its author list
-- matches the one Open5e's live v2 API reports for this document, and the Midgard
-- page's shorter list looks like the subset relevant to Midgard's own reuse rather
-- than the book's full credit.
update "public"."content_sources" set "copyright_notice" =
  'Creature Codex. © 2018 Open Design LLC; Authors Wolfgang Baur, Dan Dillon, Richard Green, James Haeck, Chris Harris, Jeremy Hochhalter, James Introcaso, Chris Lockey, Shawn Merwin, and Jon Sawatsky.'
  where "key" = 'cc';

-- Black Flag: independent confirmation that this is ORC and not CC-BY. Open5e's
-- own fixture for this document carries an ORC notice rather than an OGL section
-- 15 line — which is why their licence taxonomy, having no ORC entry, mislabels it
-- cc-by-40 in the v2 API. Kobold Press's notice names their own hosted copy of the
-- licence, so it supersedes our generic wording.
update "public"."content_sources" set "copyright_notice" =
  'Black Flag Roleplaying Reference Document v0.2, © Open Design LLC d/b/a Kobold Press. ORC NOTICE: This product is licensed under the ORC License, located at the Library of Congress at TX 9-307-067, and available online at various locations including koboldpress.com/orclicense and others. All warranties are disclaimed as set forth therein.'
  where "key" = 'blackflag';

-- Deliberately unchanged: `dmag-e`, `warlock` and `kp` keep their descriptive
-- notices. No product-specific line exists to copy — Open5e's fixtures for all
-- three carry only the placeholder "© Open Design LLC" with author "Various", and
-- `kp` is a publisher-wide catch-all rather than a product at all (its permalink
-- is Kobold Press's homepage, and the policy it points at is a fan-content
-- Community Use Policy, a different legal instrument with no section 15 text).
-- Stating the publisher and licence plainly is the honest ceiling here.
