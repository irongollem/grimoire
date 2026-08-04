import type { ChroniclerSize, ImageJobKind } from "@/types/chronicler.types";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";
import {
  captureImageGenerationContext,
  startImageGeneration as startCentralImageGeneration,
  getLocalImageJob as getCentralLocalImageJob,
} from "@/ai/useImageGeneration";
import { waitForImageJob } from "@/ai/useImageJob";

// ── Entity mention extraction ─────────────────────────────────────────────────

interface TiptapNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

export interface EntityMentionRef {
  id: string;
  entityType: "npc" | "monster" | "player";
  label: string;
}

export function extractEntityMentions(
  content: string | null,
): EntityMentionRef[] {
  if (!content) return [];
  try {
    const doc = JSON.parse(content) as TiptapNode;
    const mentions: EntityMentionRef[] = [];
    walkNodes(doc, (node) => {
      if (
        node.type === "entityMention" &&
        node.attrs?.id &&
        node.attrs?.entityType
      ) {
        mentions.push({
          id: node.attrs.id as string,
          entityType: node.attrs.entityType as EntityMentionRef["entityType"],
          label: (node.attrs.label as string) ?? "",
        });
      }
    });
    // Deduplicate by id
    return mentions.filter(
      (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
    );
  } catch {
    return [];
  }
}

function walkNodes(node: TiptapNode, fn: (n: TiptapNode) => void) {
  fn(node);
  node.content?.forEach((child) => walkNodes(child, fn));
}

export function extractPlainText(content: string | null): string {
  if (!content) return "";
  try {
    const doc = JSON.parse(content) as TiptapNode;
    const parts: string[] = [];
    walkNodes(doc, (node) => {
      if (node.text) parts.push(node.text);
    });
    return parts.join(" ").trim();
  } catch {
    return "";
  }
}

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

export function parseSceneEntities(
  text: string,
  npcs: Npc[] | undefined,
  monsters: Monster[] | undefined,
  partyMembers: PartyMember[] | undefined,
  groupPortraitUrl?: string | null,
): ResolvedEntity[] {
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
          found = {
            label: npc.name,
            portraitUrl: npc.portrait_url ?? null,
            textDescription: `${npc.name}${npc.appearance ? `: ${npc.appearance}` : ""}`,
          };
          break;
        }
      }
    }
    if (!found) {
      for (const mon of monsters ?? []) {
        if (nameMatches(mon.name, tok)) {
          found = {
            label: mon.name,
            portraitUrl: mon.image_url ?? null,
            textDescription: `${mon.name}${mon.description ? `: ${mon.description}` : ""}`,
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
