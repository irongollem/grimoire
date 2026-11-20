import { computed, type MaybeRefOrGetter } from "vue";
import { useTableSpeakers } from "@/composables/table/useTableSpeakers";
import { getNpcDisplayFocalPoint, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import type { StoryItem } from "@/lib/table/solo/soloTypes";
import { assignSpeakerColours } from "@/lib/table/solo/speakerColours";

/** What the story column draws: the stored items, then the live ones, with what is derived from them. */
export function useTableStory(stored: () => StoryItem[] | undefined, live: () => StoryItem[], campaignId: MaybeRefOrGetter<string | null>) {
  const story = computed(() => [...(stored() ?? []), ...live()]);
  // What went on record is kept among the story's items and listed in the scene column instead of between its lines.
  const recorded = computed(() => story.value.flatMap((item) => (item.kind === "margin" && item.record === true ? [{ id: item.id, text: item.text }] : [])));
  const turns = computed(() => story.value.filter((item) => item.kind === "player").length);
  const colours = computed(() => assignSpeakerColours(story.value));

  const speakerIds = computed(() => story.value.flatMap((item) => ((item.kind === "spoken" || item.kind === "acted") && item.speaker.id ? [item.speaker.id] : [])));
  const speakers = useTableSpeakers(speakerIds, campaignId);
  const portraits = computed(() => {
    const map = new Map<string, { src: string; focalPoint: { x: number; y: number } | null }>();
    for (const [id, npc] of speakers.byId.value) {
      const src = getNpcDisplayPortrait(npc);
      if (src) map.set(id, { src, focalPoint: getNpcDisplayFocalPoint(npc) ?? null });
    }
    return map;
  });
  return { story, recorded, turns, colours, portraits };
}
