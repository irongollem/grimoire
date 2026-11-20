/*
 * What a players' book's linked entries print as in its preview and its PDF (#1226 story 8).
 *
 * A players' book is read for the whole table, so each entry resolves from the Open Book's
 * whole-party snapshot (`preview_open_book`), the one rule for what every player may read,
 * and never from the DM's tables. An entry the snapshot lacks is simply not in the lookup,
 * and the caller prints nothing for it. This module restates no sharing rule: it only sets
 * what the snapshot holds.
 */
import { escapeHtml } from "@/lib/escapeHtml";
import { LOCATION_TYPE_LABELS, type LocationType } from "@/types/location.types";
import { entityRefKey, type EntityEmbedLookup, type EntityRef } from "@/scriptorium/lib/entityEmbeds";
import { entityArtFiguresHtml } from "@/scriptorium/lib/entityArt";
import { richTextOrPlain } from "@/scriptorium/lib/scriptoriumImport";
import { canonEmbedHtml } from "@/scriptorium/lib/canonEmbedHtml";
import { playerNpcHtml } from "@/scriptorium/lib/playerEmbedHtml";
import { LORE_KINDS, type LoreKind } from "@/types/canon.types";
import type { OpenBookSnapshot } from "@/types/openBook.types";

export type WorldDateLabel = (year: number, month: number | null, day: number | null) => string;

/** Plain wording for a date in the world, for a caller with no calendar to hand. */
export const plainWorldDate: WorldDateLabel = (year, month, day) =>
  [`Year ${year}`, month === null ? null : `month ${month}`, day === null ? null : `day ${day}`].filter(Boolean).join(", ");

function codex(kind: string, name: string, typeLine: string | null, body: string): string {
  const type = typeLine ? `<p class="sc-codex-entry-type"><em>${escapeHtml(typeLine)}</em></p>\n` : "";
  return `<div class="sc-codex-entry sc-codex-entry--${kind}">\n<h3 class="sc-codex-entry-name">${escapeHtml(name)}</h3>\n${type}${body}</div>\n`;
}

function loreKind(value: string | null): LoreKind | null {
  return (LORE_KINDS as readonly string[]).includes(value ?? "") ? (value as LoreKind) : null;
}

/** The lookup for the refs a players' book holds: only entries the snapshot carries have a value. */
export function snapshotEmbedLookup(
  snapshot: OpenBookSnapshot | null,
  refs: readonly EntityRef[],
  dateLabel: WorldDateLabel = plainWorldDate,
): EntityEmbedLookup {
  const out: EntityEmbedLookup = {};
  if (!snapshot) return out;
  const find = <T extends { id: string }>(rows: readonly T[], id: string) => rows.find((r) => r.id === id);
  for (const ref of refs) {
    const key = entityRefKey(ref);
    switch (ref.type) {
      case "location": {
        const place = find(snapshot.places, ref.id);
        if (!place) break;
        const type = place.location_type && place.location_type in LOCATION_TYPE_LABELS ? LOCATION_TYPE_LABELS[place.location_type as LocationType] : null;
        const summary = place.player_summary ? `<p>${escapeHtml(place.player_summary)}</p>\n` : "";
        const art = entityArtFiguresHtml({ picture: place.image_url, cutout: null, alt: place.name });
        out[key] = codex("location", place.name, type, art + summary + richTextOrPlain(place.description));
        break;
      }
      case "npc": {
        const person = find(snapshot.folk, ref.id);
        if (person) out[key] = playerNpcHtml({ name: person.name, portrait_url: person.portrait_url, race: person.race, occupation: person.occupation }) ?? undefined;
        break;
      }
      case "faction": {
        const faction = find(snapshot.factions, ref.id);
        if (faction) out[key] = codex("faction", faction.name, faction.faction_type, richTextOrPlain(faction.description));
        break;
      }
      case "deity": {
        const deity = find(snapshot.deities, ref.id);
        if (deity) out[key] = codex("deity", deity.name, deity.titles, richTextOrPlain(deity.description));
        break;
      }
      case "canon": {
        const truth = find(snapshot.truths, ref.id);
        if (truth) {
          out[key] = canonEmbedHtml({ kind: "truth", title: truth.title });
          break;
        }
        const lore = find(snapshot.lore, ref.id);
        if (lore) {
          out[key] = canonEmbedHtml({
            kind: "lore",
            title: lore.title,
            loreKind: loreKind(lore.lore_kind),
            date: lore.world_date ? dateLabel(lore.world_date.year, lore.world_date.month, lore.world_date.day) : null,
            body: lore.body,
            passages: lore.passages.map((p) => ({ title: p.title, body: p.body })),
          });
        }
        break;
      }
      // The snapshot holds no monsters, items, spells, quests, species or subclasses: a players' book prints none.
      default:
        break;
    }
  }
  return out;
}
