-- Extend location_type_enum with world and plane
-- world = planet/world body (Toril, Oerth, Krynn, Eberron)
-- plane = dimension/realm (Nine Hells, Feywild, Shadowfell, Astral Plane, etc.)
alter type location_type_enum add value 'world';
alter type location_type_enum add value 'plane';
