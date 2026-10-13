import { placeRoute } from "@/lib/locations/placeRoute";
import type { SecretEntityType } from "@/types/npcMemory.types";

/** What a secret's home is called in the memory picker and on a line. */
export const SECRET_ENTITY_LABELS: Record<SecretEntityType, string> = {
  location: "Location",
  item: "Item",
  puzzle: "Puzzle",
  note: "Note",
  faction: "Faction",
};

/** Where the entity holding a [secret] block opens (routes.ts: /vault is the item detail). */
export function secretEntityRoute(type: SecretEntityType, id: string): string {
  const key = encodeURIComponent(id);
  switch (type) {
    case "location":
      return placeRoute(id);
    case "item":
      return `/vault/${key}`;
    case "puzzle":
      return `/puzzles/${key}`;
    case "note":
      return `/notes/${key}`;
    case "faction":
      return `/factions/${key}`;
  }
}

/** The three columns that name a disclosed block: all set or all null. */
export interface SecretRef {
  secret_entity_type: SecretEntityType;
  secret_entity_id: string;
  secret_id: string;
}
