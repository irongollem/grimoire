/*
 * What a PLAYER sees of an `entityEmbed` in a shared handout (#970).
 *
 * Every function here takes a row from a player-gated projection (or, for a
 * spell, public rules content) and emits only what that row holds. None of
 * them is the DM formatter in scriptoriumImport.ts, which prints the true
 * name, the whole portrait set and the lore of a row it was handed unscoped.
 * Each wraps its output in the same `sc-*` classes the DM formatter uses for
 * that entity type so the theme CSS styles it identically, and portraits go
 * through entityArtFiguresHtml so the node's showArt/art options still apply
 * afterwards (applyEmbedNodeOptions).
 *
 * `null` means "this reader may not see it": the caller renders nothing at
 * all, not a marker (hidden things do not exist for a player).
 */
import { escapeHtml } from "@/lib/escapeHtml";
import { entityArtFiguresHtml } from "@/lib/scriptorium/entityArt";
import { formatEntityEmbedBodyHtml, richTextOrPlain } from "@/lib/scriptorium/scriptoriumImport";
import { LOCATION_TYPE_LABELS, type Location } from "@/types/location.types";
import type { PlayerVisibleMonster } from "@/types/monster.types";
import type { PlayerNpc } from "@/types/npc.types";
import type { Item } from "@/types/item.types";
import type { Quest } from "@/types/quest.types";
import type { Spell } from "@/types/spell.types";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

/** Name heading, the portrait if revealed, and a species · occupation line if
 *  revealed. A name the player has not been given means the NPC is absent. */
export function playerNpcHtml(
  npc: Pick<PlayerNpc, "name" | "portrait_url" | "race" | "occupation">,
): string | null {
  if (!npc.name) return null;
  let html = `<h1>${escapeHtml(npc.name)}</h1>\n`;
  // Only the picture: a cutout could be the true face of a disguised NPC
  // whose projection swapped the portrait to its cover.
  html += entityArtFiguresHtml({ picture: npc.portrait_url, cutout: null, alt: npc.name });
  const line = [npc.race, npc.occupation].filter((v): v is string => !!v).map(escapeHtml).join(" · ");
  if (line) html += `<p><em>${line}</em></p>\n`;
  return html;
}

/**
 * A discovered monster. With its stats revealed it is the full stat block, as
 * the player bestiary shows; without, only name, picture and the size/type
 * line, because `reveal_stats` is what gates the numbers. The row's DM notes
 * and description are blanked first: the formatter prints both and neither is
 * something a handout should hand over.
 */
export function playerMonsterHtml(
  monster: PlayerVisibleMonster,
  revealStats: boolean,
  theme: ScriptoriumTheme,
): string {
  const { stat_block: statBlock } = monster;
  if (revealStats && statBlock) {
    return formatEntityEmbedBodyHtml(
      { type: "monster", monster: { ...monster, stat_block: statBlock, notes: null, description: null } },
      theme,
    );
  }
  let html = `<h1>${escapeHtml(monster.name)}</h1>\n`;
  html += entityArtFiguresHtml({ picture: monster.image_url, cutout: monster.cutout_url, alt: monster.name });
  const typeLine = [monster.size, monster.monster_type].filter(Boolean).join(" ");
  if (typeLine) html += `<p><em>${escapeHtml(typeLine)}</em></p>\n`;
  return html;
}

/** A shared place: its name and kind, and its description only once the DM
 *  has shared that too (`is_description_shared`). Notes never appear. */
export function playerLocationHtml(
  location: Pick<Location, "name" | "location_type" | "description" | "is_description_shared">,
): string {
  let html = `<h1>${escapeHtml(location.name)}</h1>\n`;
  html += `<p><em>${escapeHtml(LOCATION_TYPE_LABELS[location.location_type])}</em></p>\n`;
  if (location.is_description_shared && location.description) html += richTextOrPlain(location.description);
  return html;
}

/** A quest the player can already see: its title and one-line summary, which
 *  the schema documents as player-facing. No objectives, giver or place. */
export function playerQuestHtml(quest: Pick<Quest, "title" | "summary">): string {
  let html = `<h1>${escapeHtml(quest.title)}</h1>\n`;
  if (quest.summary) html += `<p>${escapeHtml(quest.summary)}</p>\n`;
  return html;
}

/** Spell text is rules content, not a secret, so the ordinary formatter is
 *  fine for a row the player could read anyway. */
export function playerSpellHtml(spell: Spell): string {
  return formatEntityEmbedBodyHtml({ type: "spell", spell });
}

/** An item the player's own projection already returned (unidentified gating
 *  applied there). The DM-only curse text is dropped regardless. */
export function playerItemHtml(item: Item): string {
  return formatEntityEmbedBodyHtml({ type: "item", item: { ...item, curse_description: null, dm_notes: null }, spells: [] });
}
