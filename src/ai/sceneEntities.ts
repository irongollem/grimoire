import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { Faction } from "@/types/faction.types";
import type { Location } from "@/types/location.types";
import { toPlainText } from "@/ai/utils";

// ── Entity material resolution ────────────────────────────────────────────────
//
// Shared by the Chronicler (scene illustrations, chronicle text) and the
// soundboard's AI music form: both let a DM @-mention party members, NPCs,
// monsters, locations and factions in a free-text description, and both need
// the same two things back out of a mention — an image to hand the model and
// a short plain-text description for context.

export interface ResolvedEntity {
  label: string;
  portraitUrl: string | null;
  textDescription: string | null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameMatches(entityName: string, token: string): boolean {
  const name = entityName.toLowerCase();
  const tok = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  const norm = normName(entityName);
  return (
    norm === tok ||
    norm.startsWith(tok) ||
    name.startsWith(token.toLowerCase()) ||
    (tok.length >= 3 && norm.includes(tok))
  );
}

// Rich-text fields (NPC appearance, monster/faction description, location
// description) are Tiptap JSON — flatten before handing them to the image
// prompt, and cap so one verbose entry can't crowd out the others in the
// prompt's fixed budget.
const TEXT_DESCRIPTION_CHAR_CAP = 500;

function summarize(richText: string | null | undefined): string {
  const plain = toPlainText(richText);
  if (plain.length <= TEXT_DESCRIPTION_CHAR_CAP) return plain;
  return `${plain.slice(0, TEXT_DESCRIPTION_CHAR_CAP).trimEnd()}…`;
}

export interface SceneEntitySources {
  partyMembers?: PartyMember[];
  npcs?: Npc[];
  monsters?: Monster[];
  locations?: Location[];
  factions?: Faction[];
  groupPortraitUrl?: string | null;
}

export function parseSceneEntities(
  text: string,
  sources: SceneEntitySources,
): ResolvedEntity[] {
  const { partyMembers, npcs, monsters, locations, factions, groupPortraitUrl } = sources;

  // Extract @Token — stops at whitespace and common punctuation
  const tokens = [...text.matchAll(/@([A-Za-z][^\s,.'":;!?@]*)/g)].map(
    (m) => m[1],
  );
  const unique = [...new Set(tokens)];

  const allEntities: ResolvedEntity[] = [];
  const seen = new Set<string>();

  for (const tok of unique) {
    // @party / @Party resolves to the stored group portrait
    if (tok.toLowerCase() === "party" && groupPortraitUrl) {
      if (!seen.has("Party")) {
        seen.add("Party");
        allEntities.push({
          label: "Party",
          portraitUrl: groupPortraitUrl,
          textDescription: "The adventuring party",
        });
      }
      continue;
    }

    let found: ResolvedEntity | null = null;

    for (const pm of partyMembers ?? []) {
      if (nameMatches(pm.name, tok)) {
        found = {
          label: pm.name,
          portraitUrl: pm.portrait_url ?? null,
          textDescription: pm.name,
        };
        break;
      }
    }
    if (!found) {
      for (const npc of npcs ?? []) {
        if (nameMatches(npc.name, tok)) {
          const appearance = summarize(npc.appearance);
          found = {
            label: npc.name,
            portraitUrl: npc.portrait_url ?? null,
            textDescription: `${npc.name}${appearance ? `: ${appearance}` : ""}`,
          };
          break;
        }
      }
    }
    if (!found) {
      for (const mon of monsters ?? []) {
        if (nameMatches(mon.name, tok)) {
          const description = summarize(mon.description);
          found = {
            label: mon.name,
            portraitUrl: mon.image_url ?? null,
            textDescription: `${mon.name}${description ? `: ${description}` : ""}`,
          };
          break;
        }
      }
    }
    if (!found) {
      for (const loc of locations ?? []) {
        if (nameMatches(loc.name, tok)) {
          const description = summarize(loc.description);
          found = {
            label: loc.name,
            portraitUrl: loc.image_url ?? null,
            textDescription: `${loc.name}${description ? `: ${description}` : ""}`,
          };
          break;
        }
      }
    }
    if (!found) {
      for (const faction of factions ?? []) {
        if (nameMatches(faction.name, tok)) {
          const type = faction.faction_type?.trim();
          const description = summarize(faction.description);
          // Only claim a reference image when one is actually attached — a
          // faction without an emblem sends none, and the model should not go
          // looking for it.
          const emblemLine = faction.emblem_url
            ? "; its reference image is the faction's emblem: show it on banners, tabards, shields or insignia, never as a person or creature"
            : "; show its presence through its members' shared colours and insignia, never as a person or creature";
          found = {
            label: faction.name,
            portraitUrl: faction.emblem_url ?? null,
            textDescription:
              `${faction.name} — a faction${type ? `, ${type}` : ""}${emblemLine}` +
              `${description ? `. ${description}` : ""}`,
          };
          break;
        }
      }
    }

    if (found && !seen.has(found.label)) {
      seen.add(found.label);
      allEntities.push(found);
    }
  }

  return allEntities;
}

/**
 * Turns `@Old_Vesper` back into `Old Vesper` — for handing a description to a
 * model that should read names, not the underscore-joined tokens
 * `MentionTextarea` inserts. Matches the same token shape `parseSceneEntities`
 * extracts (stops at whitespace and common punctuation) so a stray `@` in
 * ordinary prose is untouched.
 */
export function stripMentionTokens(text: string): string {
  return text.replace(/@([A-Za-z][^\s,.'":;!?@]*)/g, (_, token: string) => token.replace(/_/g, " "));
}
