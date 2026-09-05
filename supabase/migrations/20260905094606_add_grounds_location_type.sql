-- An outdoor site: `grounds`. Story #817, epic #780.
--
-- The ladder had nowhere to put a garden. #810 made the site tier the places
-- with a floor plan — building, dungeon, store, tavern, inn — and every one of
-- them is roofed, so a palace garden fell out to `wilderness` and became
-- terrain. It is not terrain: it is a bounded space inside a building, with
-- paths, a maze, a fountain and a terrace in it. Exactly the thing you trace.
--
-- This generalises well past the row that surfaced it — cloisters, temple
-- precincts, walled courtyards, graveyards, arenas, a keep's bailey — and a
-- dungeon can hold one as easily as a palace can.
--
-- Adding the value is a migration of its own **because a new enum value cannot
-- be used in the transaction that adds it** ("unsafe use of new value of enum
-- type"). Everything that reads or writes 'grounds' therefore lives in
-- 20260905094607, which runs afterwards in its own transaction. Do not merge
-- the two back together.

alter type location_type_enum add value if not exists 'grounds';
