import { computed, watch } from "vue";
import { useParty } from "@/composables/party/useParty";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { currentBeatsByQuest } from "@/lib/hearth/currentBeats";
import { useAppUiStore } from "@/stores/ui/app";

export interface PlayedCharacterDeps {
  /** The character the stored sitting belongs to, once it has been read. */
  storedId: () => string | null | undefined;
  /** The character a new sitting begins with. */
  newId: () => string | null;
  sessionId: () => string | null;
}

/** The character this sitting plays, and what that character is after. */
export function usePlayedCharacter(deps: PlayedCharacterDeps) {
  const appUi = useAppUiStore();
  const party = useParty();
  const characterId = computed(() => deps.storedId() ?? deps.newId());
  const member = computed(() => party.data.value?.find((m) => m.id === characterId.value) ?? null);
  const characterName = computed(() => party.data.value?.find((m) => m.id === characterId.value)?.name ?? "your character");
  // Playing is done as a player: the shell stands on the player side as this character (see `tablePlay` in the app
  // store). The door sets it before coming here; this covers a sitting reached any other way.
  watch(
    () => member.value?.id ?? null,
    (id) => {
      if (id !== null && appUi.tablePlay?.memberId !== id) appUi.enterTablePlay(id, deps.sessionId());
    },
    { immediate: true },
  );

  // "What you are after": the quests and current beats as the played character sees them, through the same
  // player-visible projections the Hearth reads (never the DM's own quest rows). No character, nothing shown.
  // A quest whose current beat has no player text still shows, by its title: it is known to the character.
  const playedId = computed(() => (member.value ? member.value.id : null));
  const knownQuests = usePlayerVisibleQuests(playedId);
  const knownBeats = usePlayerQuestBeats(undefined, playedId);
  const after = computed(() =>
    playedId.value !== null && knownQuests.data.value && knownBeats.data.value
      ? currentBeatsByQuest(knownQuests.data.value, knownBeats.data.value)
      : [],
  );
  return { member, characterName, playedId, after };
}
