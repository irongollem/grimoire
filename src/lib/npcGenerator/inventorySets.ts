export interface NpcStarterInventoryPack {
  id: string;
  label: string;
  cues: readonly string[];
  items: readonly string[];
}

/** Defaults shared by NPC generation and the admin Content editor. */
export const DEFAULT_NPC_STARTER_INVENTORY_PACKS: readonly NpcStarterInventoryPack[] = [
  { id: "merchant", label: "Merchant", cues: ["merchant", "shopkeeper", "trader", "peddler", "innkeeper"], items: ["Coin purse", "Ledger", "Trade goods"] },
  { id: "guard", label: "Guard or soldier", cues: ["guard", "soldier", "watch", "captain", "mercenary", "knight"], items: ["Service weapon", "Uniform or armor", "Whistle"] },
  { id: "scholar", label: "Scholar", cues: ["scholar", "sage", "librarian", "scribe", "researcher"], items: ["Research notes", "Ink and quill", "Reference book"] },
  { id: "priest", label: "Priest or healer", cues: ["priest", "cleric", "acolyte", "temple", "healer"], items: ["Holy symbol", "Healing supplies", "Prayer book"] },
  { id: "criminal", label: "Criminal or spy", cues: ["thief", "spy", "smuggler", "assassin", "criminal"], items: ["Disguise kit", "Lockpicks", "Unmarked purse"] },
  { id: "traveler", label: "Traveler or guide", cues: ["traveler", "guide", "ranger", "scout", "messenger"], items: ["Map", "Rations", "Waterskin"] },
  { id: "everyday", label: "Everyday carry", cues: [], items: ["Coin purse", "Personal keepsake"] },
];

function matchesCue(text: string, cue: string): boolean {
  const escaped = cue.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

/** Choose the first matching role pack, or its final uncued fallback. */
export function npcStarterInventory(
  occupation: string | null,
  tags: readonly string[] = [],
  packs: readonly NpcStarterInventoryPack[] = DEFAULT_NPC_STARTER_INVENTORY_PACKS,
): string[] {
  const description = [occupation ?? "", ...tags].join(" ").toLowerCase();
  const pack = packs.find((candidate) => candidate.id !== "everyday" && candidate.cues.some((cue) => matchesCue(description, cue)))
    ?? packs.find((candidate) => candidate.id === "everyday")
    ?? DEFAULT_NPC_STARTER_INVENTORY_PACKS.at(-1);
  return [...(pack?.items ?? [])];
}
