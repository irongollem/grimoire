import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

/**
 * What the table screen's address says: which conversation it is on and, for a new one, who sits and where.
 */
export function useTableAddress() {
  const route = useRoute();
  const router = useRouter();
  const param = computed(() => String(route.params.sessionId));

  // `new` is a conversation that does not exist yet: its first turn creates it, and the address then becomes the real
  // id without remounting, because a remount would drop the story that is streaming in.
  function openedId(): string | null {
    return param.value === "new" ? null : param.value;
  }
  function queryText(key: string): string | null {
    const value = route.query[key];
    return typeof value === "string" && value !== "" ? value : null;
  }

  // What a NEW conversation begins with, read once: the address loses its query when it becomes the real id.
  const newCharacterId = ref<string | null>(queryText("character"));
  const newPlaceId = ref<string | null>(queryText("place"));
  // The stored conversation to draw. Never the id this screen created itself: that story is already on the page.
  const historyId = ref<string | null>(openedId());
  const sceneId = ref<string | null>(newPlaceId.value);

  // A new sitting is about someone: with nobody chosen there is nothing to begin, so it goes back to choosing.
  function backToChoosing(): void {
    if (param.value === "new" && newCharacterId.value === null) void router.replace("/table");
  }
  backToChoosing();

  /** The address changed under a mounted page: read everything it begins with again. */
  function reread(): void {
    historyId.value = openedId();
    newCharacterId.value = queryText("character");
    newPlaceId.value = queryText("place");
    sceneId.value = newPlaceId.value;
    backToChoosing();
  }

  return { param, openedId, newCharacterId, newPlaceId, historyId, sceneId, reread };
}
