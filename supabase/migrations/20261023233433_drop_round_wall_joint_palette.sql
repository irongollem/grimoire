-- #1063 / #1096: rounded wall joints are gone. A round joint carved the wrong
-- side of a room's corner and was never shipped in a library pack; the vector
-- brush (#1073 story 8) draws rounded rooms instead, and Shift+click lines make
-- a rectangular room with corners rounded at the brush radius. `wallRoundJoint`
-- left the pack schema in the same change.
--
-- The only trace in the data is a placeholder colour under `manifest.palette`
-- on stone-dungeon v3 (archived) and v4 (published). No library pack, user pack
-- or campaign pack carries `wallRoundJoint` tiles. Strip the key so no manifest
-- names a category the schema no longer has.

update public.library_tile_packs
set manifest = manifest #- '{palette,wallRoundJoint}'
where manifest -> 'palette' ? 'wallRoundJoint';

update public.user_tile_packs
set manifest = manifest #- '{palette,wallRoundJoint}'
where manifest -> 'palette' ? 'wallRoundJoint';
