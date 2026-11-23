import type { ItemAiGenerated } from "@/ai/types";
import type { ItemInsert } from "@/types/item.types";
import { toTiptapJson } from "@/lib/tiptap/markdownToTiptap";

export function generatedItemPayload(result: ItemAiGenerated, campaignId: string | null): ItemInsert {
  return {
    name: result.name,
    item_type: result.item_type,
    subtype: result.subtype ?? null,
    rarity: result.rarity,
    requires_attunement: result.requires_attunement ?? false,
    attunement_requirements: result.attunement_requirements ?? null,
    weight: result.weight !== null && result.weight !== undefined ? parseFloat(String(result.weight)) || null : null,
    cost: result.cost ?? null,
    damage_rolls: result.damage_rolls ?? null,
    armor_class: result.armor_class ?? null,
    properties: result.properties ?? [],
    weapon_range: result.weapon_range ?? null,
    versatile_damage: result.versatile_damage ?? null,
    charges: result.charges ?? null,
    recharge: result.recharge ?? null,
    spell_ids: [],
    description: result.description ? toTiptapJson(result.description) : "",
    mundane_description: result.mundane_description ? toTiptapJson(result.mundane_description) : null,
    source: "Grimoire:AI",
    tags: result.tags ?? [],
    image_url: result.image_url ?? null,
    image_focal_point: null,
    curse_description: result.curse_description ?? null,
    is_arcane_focus: false,
    ai_provenance: result.ai_provenance ?? null,
    campaign_id: campaignId,
  };
}
