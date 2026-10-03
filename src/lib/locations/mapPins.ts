import type { Location, MapPin } from "@/types/location.types";

/**
 * A pin carries a denormalised copy of its place's name, type and sigil so
 * players can read the map without a second location query. That copy goes
 * stale the moment the place is renamed or retyped, so every write of the pins
 * refreshes it from the live place first. A pin whose place is not among
 * `places` (deleted, or moved out of the candidate set) keeps what it has:
 * dropping it here would silently delete a DM's placement.
 */
export function refreshPinMetadata(
  pins: readonly MapPin[],
  places: ReadonlyArray<Pick<Location, "id" | "name" | "location_type" | "image_url">>,
): MapPin[] {
  if (!pins.length || !places.length) return [...pins];
  const byId = new Map(places.map((p) => [p.id, p]));
  return pins.map((pin) => {
    const place = byId.get(pin.child_location_id);
    return place
      ? {
          ...pin,
          child_type: place.location_type,
          child_name: place.name,
          child_image_url: place.image_url,
        }
      : pin;
  });
}
