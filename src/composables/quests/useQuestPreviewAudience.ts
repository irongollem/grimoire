import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useParty } from "@/composables/party/useParty";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { groupPlayerBeatsByThread } from "@/lib/quests/playerThreads";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * Which party member a quest is previewed as, and the quest as that member is
 * authorised to read it. Shared by the preview drawer and the Players' view
 * pane, so the two can never disagree about who is being looked through.
 */
export function useQuestPreviewAudience(questId: MaybeRefOrGetter<string>, visibleTo: MaybeRefOrGetter<string[]>) {
  const appUi = useAppUiStore();
  const { data: party } = useParty();
  const audienceId = ref(appUi.dmPreviewPartyMemberId ?? "");
  const audienceOptions = computed(() => (party.value ?? []).filter((member) => toValue(visibleTo).includes(member.id)));
  const audience = computed(() => audienceOptions.value.find((member) => member.id === audienceId.value) ?? null);
  // The `<select>` needs "" for its empty option, but the RPC parameter is a uuid
  // and `??` would forward the empty string straight into Postgres (22P02). No
  // audience is chosen until the party resolves, and never for a quest shared
  // with nobody.
  const previewAudienceId = computed(() => audienceId.value || null);
  const beatsQuery = usePlayerQuestBeats(computed(() => toValue(questId)), previewAudienceId);
  const beats = computed(() => beatsQuery.data.value ?? []);
  // Widens a surface once there is more than one thread to read side by side.
  const hasMultipleThreads = computed(() => groupPlayerBeatsByThread(beats.value).length > 1);

  watch(audienceOptions, (options) => {
    if (!options.some((member) => member.id === audienceId.value)) audienceId.value = options[0]?.id ?? "";
  }, { immediate: true });

  return { audienceId, audienceOptions, audience, beatsQuery, beats, hasMultipleThreads };
}
