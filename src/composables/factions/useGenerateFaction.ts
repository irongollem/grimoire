/**
 * "Generate a faction with AI and insert it": the generate-then-create step `FactionGeneratorPanel` used to hold
 * inline, extracted so Ask Grimoire (#1253) runs the exact same pipeline as the page.
 *
 * Three parts, kept apart on purpose: the faction row, its leader (a "Leader" membership of an existing NPC) and its
 * headquarters (a "based in" tie to an existing place). The faction is saved first; a leader or headquarters that
 * then fails to link is reported in the outcome and never undoes it, because the generation was already paid for. A
 * failed faction save throws, so the caller can say nothing was kept.
 */
import { useCreateFaction, useAddFactionNpc } from "@/composables/factions/useFactions";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { useFactionGeneration, type FactionGenerationOptions } from "@/ai/useFactionGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { typeChoices } from "@/lib/worldLinks/connections";

// The headquarters is a "based in" tie from the new faction to the place (#1084).
const BASED_IN = (() => {
  const choice = typeChoices("faction", "location").find((c) => c.key === "based_in" && c.subjectIsFrom);
  if (!choice) throw new Error("the catalogue has no faction to place 'based in' type");
  return choice;
})();

export interface GenerateFactionOptions extends FactionGenerationOptions {
  /** An existing NPC to seat as the leader. */
  leaderNpcId?: string | null;
  /** An existing place the faction is based in. */
  headquartersLocationId?: string | null;
}

export type LinkState = "none" | "saved" | "failed";

export interface GenerateFactionOutcome {
  /** The created row's id, or `null` when generation failed. */
  id: string | null;
  /** A user-facing reason for a `null` id, or `null` on success. */
  error: string | null;
  name: string | null;
  /** `none` when no emblem was asked for, `failed` when asked for and not painted (the faction is saved either way). */
  picture: "none" | "saved" | "failed";
  leader: LinkState;
  headquarters: LinkState;
  /** One sentence per tie that could not be added. */
  linkErrors: string[];
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : "unknown error";
}

export function useGenerateFaction() {
  const { mutateAsync: createFaction } = useCreateFaction();
  const { mutateAsync: addFactionNpc } = useAddFactionNpc();
  const { mutateAsync: createConnection } = useCreateConnection();
  const { generate, error: genError } = useFactionGeneration();

  async function generateAndCreateFaction(concept: string, options: GenerateFactionOptions = {}): Promise<GenerateFactionOutcome> {
    const nothing = (error: string): GenerateFactionOutcome => (
      { id: null, error, name: null, picture: "none", leader: "none", headquarters: "none", linkErrors: [] }
    );
    if (isAnyAiGenerating.value) return nothing("Another AI generation is already in progress.");

    const { leaderNpcId, headquartersLocationId, ...generationOptions } = options;
    const result = await generate(concept, generationOptions);
    if (!result) return nothing(genError.value ?? "Faction generation failed.");

    const faction = await createFaction({
      name: result.name,
      faction_type: result.faction_type || null,
      alignment: result.alignment || null,
      description: toTiptapJson(result.description),
      emblem_url: result.image_url,
      player_visible_to: [],
      tags: result.tags,
      ai_provenance: result.ai_provenance ?? null,
    });

    const [leader, headquarters] = await Promise.allSettled([
      leaderNpcId
        ? addFactionNpc({ faction_id: faction.id, npc_id: leaderNpcId, role: "Leader" })
        : Promise.resolve(),
      headquartersLocationId
        ? createConnection({
            subject: { kind: "faction", id: faction.id },
            other: { kind: "location", id: headquartersLocationId, name: "" },
            choice: BASED_IN,
          })
        : Promise.resolve(),
    ]);
    const linkErrors: string[] = [];
    if (leader.status === "rejected") linkErrors.push(`The leader could not be added: ${reason(leader.reason)}`);
    if (headquarters.status === "rejected") linkErrors.push(`The headquarters could not be set: ${reason(headquarters.reason)}`);

    const asked = generationOptions.generateImage !== false;
    return {
      id: faction.id,
      error: null,
      name: result.name,
      picture: !asked ? "none" : result.image_url ? "saved" : "failed",
      leader: !leaderNpcId ? "none" : leader.status === "fulfilled" ? "saved" : "failed",
      headquarters: !headquartersLocationId ? "none" : headquarters.status === "fulfilled" ? "saved" : "failed",
      linkErrors,
    };
  }

  return { generateAndCreateFaction };
}
