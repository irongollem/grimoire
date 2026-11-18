-- The 2024 Greater Invisibility has its text again (#1021).
--
-- `srd_srd_2024_greater_invisibility` was the one library spell of 1,783 with an empty description. The gap is
-- upstream: Open5e's own record for it (`srd-2024_greater-invisibility`) has an empty `desc`, and the import copied
-- that. It surfaced when two independent readers of the spell conditions pass both declined to read a spell with
-- no text. The sentence is the System Reference Document 5.2.1's own, confirmed by the maintainer on 18 Nov 2026.
--
-- Only an empty description is filled: a row someone has since given text is left as it is.

update public.library_spells
   set description = 'A creature you touch has the Invisible condition until the spell ends.',
       provenance = coalesce(provenance, '{}'::jsonb)
         || jsonb_build_object('description_restored', jsonb_build_object('by', 'migration', 'why', 'empty upstream in Open5e', 'at', '2026-11-18'))
 where id = 'srd_srd_2024_greater_invisibility'
   and coalesce(btrim(description), '') = '';
