/**
 * Ask Grimoire (#1270): the half of a scene picture the two "describe a scene" cards share, a note's and a book's.
 *
 * Both read the @-mentions of the description the way the old dialog did (`useAskSceneResolver`: characters, creatures,
 * places and factions resolved to pictures and looks), say so on the quote, and start the same render
 * (`startChroniclerImage`) after the same likeness check. What differs is where the finished picture is put and which
 * shapes are on offer, so that stays in each adapter.
 */
import type { AskQuoteLine } from "@/lib/ask/askAdapter";
import { useAskSceneResolver } from "@/ai/ask/askSceneMentions";
import { startChroniclerImage } from "@/ai/useChroniclerImageGeneration";
import type { ResolvedSceneEntity } from "@/ai/sceneEntities";
import type { ChroniclerSize } from "@/types/chronicler.types";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";

export interface ReadScene {
  entities: ResolvedSceneEntity[];
  /** True while the lists a mention is looked up in have not arrived, so a quote never resolves against nothing. */
  loading: boolean;
  /** What the quote says about the mentions, or nothing when the description names none. */
  line: AskQuoteLine | null;
}

export function useAskSceneRender() {
  const scene = useAskSceneResolver();
  const { ensureLikenessAck } = useLikenessGate();

  /** The description's mentions, resolved. The campaign's people and places are read only once a description names one. */
  function read(concept: string): ReadScene {
    const { entities, loading } = scene.resolve(concept);
    if (!/@[A-Za-z]/.test(concept)) return { entities, loading: false, line: null };
    const seen = entities.filter((e) => e.portraitUrl).map((e) => e.label);
    const line: AskQuoteLine = entities.length === 0
      ? { label: "Characters", value: "No @mention matched a known character: painted from the description only", credits: null }
      : { label: "Characters", value: seen.length > 0 ? `${entities.map((e) => e.label).join(", ")} (pictures of ${seen.length} read)` : entities.map((e) => e.label).join(", "), credits: null };
    return { entities, loading, line };
  }

  /**
   * Queues the render and returns its job, or null when the DM declined the likeness notice (nothing is charged then).
   * Only a scene whose mentions resolve to pictures sends portrait references, so a plain scene needs no acknowledgement,
   * which is the server's own rule.
   */
  async function start(args: { concept: string; entities: ResolvedSceneEntity[]; size: ChroniclerSize; noteId: string | null }): Promise<{ jobId: string } | null> {
    const hasPortraitReferences = args.entities.some((e) => e.portraitUrl);
    if (hasPortraitReferences && !(await ensureLikenessAck())) return null;
    return startChroniclerImage({ sceneText: args.concept, entities: args.entities, size: args.size, noteId: args.noteId });
  }

  return { read, start };
}
