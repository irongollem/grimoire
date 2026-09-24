import type { ChroniclerSize, ImageJobKind } from "@/types/chronicler.types";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import type { Faction } from "@/types/faction.types";
import {
  captureImageGenerationContext,
  startImageGeneration as startCentralImageGeneration,
  getLocalImageJob as getCentralLocalImageJob,
} from "@/ai/useImageGeneration";
import { waitForImageJob } from "@/ai/useImageJob";
import { toPlainText } from "@/ai/utils";

// ── Entity material resolution ────────────────────────────────────────────────

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

// Rich-text fields (NPC appearance, monster/faction description) are Tiptap
// JSON — flatten before handing them to the image prompt, and cap so one
// verbose entry can't crowd out the others in the prompt's fixed budget.
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
  factions?: Faction[];
  groupPortraitUrl?: string | null;
}

export function parseSceneEntities(
  text: string,
  sources: SceneEntitySources,
): ResolvedEntity[] {
  const { partyMembers, npcs, monsters, factions, groupPortraitUrl } = sources;

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

// ── Image generation ──────────────────────────────────────────────────────────

// Local (BYOK) jobs never touch the DB — there is no row to poll — so an
// in-memory map is the only record of an in-flight local render. Entries are
// removed once the promise settles (either way); a page reload loses any
// still-pending entries, which is accepted (see task notes).
/** Looks up an in-flight local (BYOK) image render started by startChroniclerImage. */
export function getLocalImageJob(jobId: string): Promise<string> | undefined {
  return getCentralLocalImageJob(jobId);
}

/**
 * Kicks off a chronicle image render and returns immediately with a job id —
 * never awaits the render itself. Server mode: the edge function's job id.
 * Local (BYOK) mode: a synthetic `local-<uuid>` id backed by an in-memory
 * promise (see `localImageJobs` / `getLocalImageJob`), since there is no DB
 * row to poll for a client-side render.
 */
export async function startChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
  /** The saved note this render's anchor lives in — lets the server swap
   * the anchor into the note's content on completion (#614). */
  noteId?: string | null;
}): Promise<{ jobId: string }> {
  const { sceneText, entities, size, kind = "chronicler", noteId = null } = params;
  const imageContext = captureImageGenerationContext();
  return startCentralImageGeneration({
    ...imageContext,
    purpose: kind === "group_portrait" ? "group_portrait" : "chronicler",
    subject: sceneText,
    size,
    referenceUrls: entities.flatMap((entity) => entity.portraitUrl ? [entity.portraitUrl] : []),
    textDescriptions: entities.flatMap((entity) => entity.textDescription ? [entity.textDescription] : []),
    noteId,
  });
}

/**
 * Awaits a full chronicle image render to completion. Builds on
 * startChroniclerImage — one code path for both the fire-and-forget
 * (Chronicler note) and await-to-completion (group portrait) callers.
 */
export async function generateChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
}): Promise<string> {
  const { jobId } = await startChroniclerImage(params);
  if (jobId.startsWith("local-")) {
    const promise = getLocalImageJob(jobId);
    if (!promise) throw new Error("Local image job not found.");
    return promise;
  }
  return waitForImageJob(jobId);
}
